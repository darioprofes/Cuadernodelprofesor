"""Validación de contratos y agrupaciones; no requiere conectar a PostgreSQL.

Ejecutar desde api/app con: python -m unittest discover -s ../tests
"""
import unittest
import uuid
from fastapi import HTTPException
from services.assignments import AssignmentInput, _process, _validate_group, _move_members

CLASS = str(uuid.uuid4())
PERIOD = str(uuid.uuid4())
CATEGORY = str(uuid.uuid4())
MEMBER = str(uuid.uuid4())
GROUP = str(uuid.uuid4())


class Cursor:
    def __init__(self, rows, category_type="normal"):
        self.rows = rows
        self.category_type = category_type
        self.result = []
        self.commands = []

    def execute(self, sql, args):
        self.commands.append((sql, args))
        if "SELECT type" in sql:
            self.result = [{"type": self.category_type, "evaluation_period_id": PERIOD}]
        elif "FROM assignments a JOIN categories" in sql:
            self.result = self.rows
        else:
            self.result = []

    def fetchall(self):
        return self.result

    def fetchone(self):
        return self.result[0] if self.result else None


def row(id=MEMBER, group=None, period=PERIOD):
    return {"id": id, "class_id": CLASS, "evaluation_period_id": period, "assignment_group": group, "type": "normal"}


def fields(ids=None, weights=None):
    data = AssignmentInput(categoryId=CATEGORY, evaluationPeriodId=PERIOD, name="Preguntas", evaluationMethod="direct_grade",
                           assignmentGroup={"memberIds": [MEMBER] if ids is None else ids, "color": "violet", "memberWeights": weights or {}})
    return data.model_dump(mode="json")


class AssignmentGroupTests(unittest.TestCase):
    def test_json_contract_and_storage_use_same_member_keys(self):
        data = fields(weights={MEMBER: 2})
        self.assertEqual(data["assignment_group"]["memberIds"], [MEMBER])
        self.assertEqual(_process(data)["assignment_group"].obj["memberWeights"], {MEMBER: 2})

    def test_group_accepts_existing_task_or_empty_group(self):
        _validate_group(Cursor([row()]), CLASS, GROUP, fields())
        _validate_group(Cursor([]), CLASS, GROUP, fields([]))

    def test_duplicate_self_and_missing_members_rejected(self):
        for ids in ([MEMBER, MEMBER], [GROUP], [str(uuid.uuid4())]):
            with self.subTest(ids=ids), self.assertRaises(HTTPException):
                _validate_group(Cursor([row()]), CLASS, GROUP, fields(ids))

    def test_cross_period_and_nested_groups_rejected(self):
        for member in (row(period=str(uuid.uuid4())), row(group={"memberIds": []})):
            with self.assertRaises(HTTPException):
                _validate_group(Cursor([member]), CLASS, GROUP, fields())

    def test_member_in_two_groups_rejected(self):
        with self.assertRaises(HTTPException):
            _validate_group(Cursor([row(), row(id=str(uuid.uuid4()), group={"memberIds": [MEMBER]})]), CLASS, GROUP, fields())

    def test_invalid_weights_and_recovery_category_rejected(self):
        for weight in (-1, 0, float("inf")):
            with self.assertRaises(HTTPException):
                _validate_group(Cursor([row()]), CLASS, GROUP, fields(weights={MEMBER: weight}))
        with self.assertRaises(HTTPException):
            _validate_group(Cursor([row()], category_type="recovery"), CLASS, GROUP, fields())

    def test_order_only_update_does_not_reset_internal_weights(self):
        cursor = Cursor([])
        _move_members(cursor, fields(weights={MEMBER: 2}), apply_weights=False)
        self.assertIsNone(cursor.commands[0][1][1])
        _move_members(cursor, fields(weights={MEMBER: 2}), apply_weights=True)
        self.assertEqual(cursor.commands[1][1][1], 2)


if __name__ == "__main__":
    unittest.main()
