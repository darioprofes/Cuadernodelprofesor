from fastapi import APIRouter, Depends, HTTPException

from services.auth import require_auth
from services.journal_entries import (
    JournalEntry,
    JournalEntryInput,
    JournalEntryPatch,
    list_journal_entries,
    create_journal_entry,
    update_journal_entry,
    delete_journal_entry,
)

router = APIRouter(prefix="/academic-years/{year_id}/journal-entries", tags=["Diario de clase"], dependencies=[Depends(require_auth)])
item_router = APIRouter(prefix="/journal-entries", tags=["Diario de clase"], dependencies=[Depends(require_auth)])


@router.get("", response_model=list[JournalEntry])
def get_entries(year_id: str):

    return list_journal_entries(year_id)


@router.post("", response_model=JournalEntry, status_code=201)
def post_entry(year_id: str, data: JournalEntryInput):

    return create_journal_entry(year_id, data)


@item_router.patch("/{entry_id}", response_model=JournalEntry)
def patch_entry(entry_id: str, data: JournalEntryPatch):

    entry = update_journal_entry(entry_id, data)

    if entry is None:
        raise HTTPException(status_code=404, detail="Anotación no encontrada.")

    return entry


@item_router.delete("/{entry_id}", status_code=204)
def delete_one_entry(entry_id: str):

    if not delete_journal_entry(entry_id):
        raise HTTPException(status_code=404, detail="Anotación no encontrada.")
