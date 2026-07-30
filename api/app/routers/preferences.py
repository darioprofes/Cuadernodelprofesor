from fastapi import APIRouter, Depends

from services.auth import require_auth
from services.preferences import Preferences, PreferencesInput, get_preferences, update_preferences

router = APIRouter(prefix="/preferences", tags=["Preferencias"], dependencies=[Depends(require_auth)])


@router.get("", response_model=Preferences)
def read_preferences():

    return get_preferences()


@router.put("", response_model=Preferences)
def write_preferences(data: PreferencesInput):

    return update_preferences(data)
