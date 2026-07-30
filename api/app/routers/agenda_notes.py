from fastapi import APIRouter, Depends, HTTPException

from services.auth import require_auth
from services.agenda_notes import (
    AgendaNote,
    AgendaNoteInput,
    AgendaNotePatch,
    list_agenda_notes,
    create_agenda_note,
    update_agenda_note,
    delete_agenda_note,
)

router = APIRouter(prefix="/academic-years/{year_id}/agenda-notes", tags=["Agenda"], dependencies=[Depends(require_auth)])
item_router = APIRouter(prefix="/agenda-notes", tags=["Agenda"], dependencies=[Depends(require_auth)])


@router.get("", response_model=list[AgendaNote])
def get_notes(year_id: str):

    return list_agenda_notes(year_id)


@router.post("", response_model=AgendaNote, status_code=201)
def post_note(year_id: str, data: AgendaNoteInput):

    return create_agenda_note(year_id, data)


@item_router.patch("/{note_id}", response_model=AgendaNote)
def patch_note(note_id: str, data: AgendaNotePatch):

    note = update_agenda_note(note_id, data)

    if note is None:
        raise HTTPException(status_code=404, detail="Anotación no encontrada.")

    return note


@item_router.delete("/{note_id}", status_code=204)
def delete_one_note(note_id: str):

    if not delete_agenda_note(note_id):
        raise HTTPException(status_code=404, detail="Anotación no encontrada.")
