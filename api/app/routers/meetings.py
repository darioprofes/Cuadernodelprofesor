from fastapi import APIRouter, Depends, HTTPException

from services.auth import require_auth
from services.meetings import Meeting, MeetingInput, MeetingPatch, list_meetings, create_meeting, update_meeting, delete_meeting

router = APIRouter(prefix="/academic-years/{year_id}/meetings", tags=["Reuniones"], dependencies=[Depends(require_auth)])
item_router = APIRouter(prefix="/meetings", tags=["Reuniones"], dependencies=[Depends(require_auth)])


@router.get("", response_model=list[Meeting])
def get_meetings(year_id: str):

    return list_meetings(year_id)


@router.post("", response_model=Meeting, status_code=201)
def post_meeting(year_id: str, data: MeetingInput):

    return create_meeting(year_id, data)


@item_router.patch("/{meeting_id}", response_model=Meeting)
def patch_meeting(meeting_id: str, data: MeetingPatch):

    meeting = update_meeting(meeting_id, data)

    if meeting is None:
        raise HTTPException(status_code=404, detail="Reunión no encontrada.")

    return meeting


@item_router.delete("/{meeting_id}", status_code=204)
def delete_one_meeting(meeting_id: str):

    if not delete_meeting(meeting_id):
        raise HTTPException(status_code=404, detail="Reunión no encontrada.")
