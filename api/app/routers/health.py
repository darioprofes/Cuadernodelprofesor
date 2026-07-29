from fastapi import APIRouter

router = APIRouter(tags=["Salud"])


@router.get("/health")
def health():

    return {"status": "ok"}
