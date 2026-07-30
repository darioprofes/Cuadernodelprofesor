from datetime import datetime
from typing import Optional

from pydantic import BaseModel, ConfigDict
from pydantic.alias_generators import to_camel


# Base común para todos los modelos de petición/respuesta: la base de datos
# es snake_case, el JSON que habla con el frontend es camelCase (misma regla
# de conversión que fase-0-ddl-y-api.md). populate_by_name permite construir
# el modelo tanto desde snake_case (filas de psycopg, dict_row) como desde
# camelCase (peticiones entrantes), sin tener que traducir a mano en cada
# router.
class ApiModel(BaseModel):

    model_config = ConfigDict(
        alias_generator=to_camel,
        populate_by_name=True,
        from_attributes=True,
    )


# Compara el updated_at real de una fila (datetime, tal cual sale de
# psycopg) contra el expectedUpdatedAt que manda el cliente (string ISO) —
# parseado a datetime en vez de comparado como string, para no depender de
# que el formato exacto (offset "+00:00" vs "Z", segundos con o sin
# decimales) coincida carácter a carácter entre Python y lo que reenvía el
# frontend. None en expected = no se pidió comprobación de concurrencia.
def updated_at_matches(current: datetime, expected: Optional[str]) -> bool:

    if expected is None:
        return True

    try:
        return current == datetime.fromisoformat(expected.replace("Z", "+00:00"))
    except ValueError:
        return False
