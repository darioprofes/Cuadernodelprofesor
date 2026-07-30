from fastapi import APIRouter, Depends, HTTPException

from services.auth import require_auth
from services.tasks import Task, TaskInput, TaskPatch, list_tasks, create_task, update_task, delete_task

router = APIRouter(prefix="/academic-years/{year_id}/tasks", tags=["Tareas personales"], dependencies=[Depends(require_auth)])
item_router = APIRouter(prefix="/tasks", tags=["Tareas personales"], dependencies=[Depends(require_auth)])


@router.get("", response_model=list[Task])
def get_tasks(year_id: str):

    return list_tasks(year_id)


@router.post("", response_model=Task, status_code=201)
def post_task(year_id: str, data: TaskInput):

    return create_task(year_id, data)


@item_router.patch("/{task_id}", response_model=Task)
def patch_task(task_id: str, data: TaskPatch):

    task = update_task(task_id, data)

    if task is None:
        raise HTTPException(status_code=404, detail="Tarea no encontrada.")

    return task


@item_router.delete("/{task_id}", status_code=204)
def delete_one_task(task_id: str):

    if not delete_task(task_id):
        raise HTTPException(status_code=404, detail="Tarea no encontrada.")
