from fastapi import APIRouter, Depends, HTTPException

from services.auth import require_auth
from services.evaluation_tools import (
    EvaluationTool,
    EvaluationToolInput,
    EvaluationToolPatch,
    list_evaluation_tools,
    create_evaluation_tool,
    update_evaluation_tool,
    delete_evaluation_tool,
)

router = APIRouter(prefix="/evaluation-tools", tags=["Instrumentos de evaluación"], dependencies=[Depends(require_auth)])


@router.get("", response_model=list[EvaluationTool])
def get_tools():

    return list_evaluation_tools()


@router.post("", response_model=EvaluationTool, status_code=201)
def post_tool(data: EvaluationToolInput):

    return create_evaluation_tool(data)


@router.patch("/{tool_id}", response_model=EvaluationTool)
def patch_tool(tool_id: str, data: EvaluationToolPatch):

    tool = update_evaluation_tool(tool_id, data)

    if tool is None:
        raise HTTPException(status_code=404, detail="Instrumento de evaluación no encontrado.")

    return tool


@router.delete("/{tool_id}", status_code=204)
def delete_one_tool(tool_id: str):

    if not delete_evaluation_tool(tool_id):
        raise HTTPException(status_code=404, detail="Instrumento de evaluación no encontrado.")
