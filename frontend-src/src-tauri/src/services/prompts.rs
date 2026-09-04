// ==========================================================
// Generadores de prompt para IA -- puerto a Rust de
// api/app/services/prompts/situacion_aprendizaje.py::construir_prompt()/
// procesar_respuesta() y api/app/services/prompts/instrumento_evaluacion.py::
// construir_prompt()/procesar_respuesta().
//
// Solo la vía "online" (copiar/pegar) -- Groq y la IA local NO se portan
// (ver project_tauri_ia_scope.md): en escritorio no hay backend Python al
// que llamar, así que esas dos vías se ocultan en el frontend
// (isTauri()) y solo queda esta, que es pura construcción/parseo de texto
// sobre datos que ya viven en el SQLite local -- no necesita red ni el
// sidecar Python.
//
// Import clave: al mandar el mismo body en snake_case que ya usa el
// backend web (course_id, sesiones_modo...) desde el frontend, este
// módulo puede leerlo tal cual sin tocar payloadGeneracion() en
// GenerarSituacionAprendizajeModal.tsx -- las claves de ESTE body son la
// única excepción camelCase/snake_case del resto de la app (que sí es
// camelCase en todos los servicios CRUD).

use std::collections::{BTreeMap, BTreeSet, HashMap};

use regex::Regex;
use rusqlite::Connection;
use serde_json::{json, Value};

use crate::error::ApiError;

use super::{basic_knowledge, courses, enrollments, evaluation_criteria, key_competences, preferences, programming_units, specific_competences};

// ---------- helpers de extracción de body ----------

fn req_str<'a>(body: &'a Value, key: &str) -> Result<&'a str, ApiError> {
    body.get(key).and_then(Value::as_str)
        .ok_or_else(|| ApiError::bad_request(format!("{key} es obligatorio")))
}

fn opt_str(body: &Value, key: &str) -> Option<String> {
    body.get(key).and_then(Value::as_str).map(str::to_string)
}

fn opt_bool(body: &Value, key: &str, default: bool) -> bool {
    body.get(key).and_then(Value::as_bool).unwrap_or(default)
}

fn opt_i64(body: &Value, key: &str) -> Option<i64> {
    body.get(key).and_then(Value::as_i64)
}

fn str_list(body: &Value, key: &str) -> Vec<String> {
    body.get(key).and_then(Value::as_array)
        .map(|a| a.iter().filter_map(|v| v.as_str().map(str::to_string)).collect())
        .unwrap_or_default()
}

// ---------- helpers de JSON pegado por el profesor ----------
//
// Mismo criterio que _extraer_json/_parsear_json en ambos ficheros Python:
// admite la respuesta envuelta en una valla ```json ... ``` aunque se le
// pida que no lo haga, y repara el fallo más habitual visto en real (saltos
// de línea sin escapar dentro de una cadena larga) antes de rendirse. A
// diferencia de json_repair (Python), esto NO arregla comillas internas sin
// escapar -- ese caso, más raro, sigue dando el mismo error claro que si
// json_repair tampoco pudiera con él.

fn extraer_json(texto: &str) -> String {
    let re = Regex::new(r"(?s)```(?:json)?\s*(\{.*\})\s*```").unwrap();
    match re.captures(texto) {
        Some(caps) => caps.get(1).unwrap().as_str().to_string(),
        None => texto.trim().to_string(),
    }
}

// Escapa saltos de línea/tabulaciones literales dentro de cadenas JSON --
// json.loads(strict=False) en Python los admite tal cual, serde_json no.
fn reparar_control_chars_en_cadenas(texto: &str) -> String {
    let mut out = String::with_capacity(texto.len());
    let mut in_string = false;
    let mut escaped = false;
    for c in texto.chars() {
        if in_string {
            if escaped {
                out.push(c);
                escaped = false;
                continue;
            }
            match c {
                '\\' => { out.push(c); escaped = true; }
                '"' => { out.push(c); in_string = false; }
                '\n' => out.push_str("\\n"),
                '\r' => out.push_str("\\r"),
                '\t' => out.push_str("\\t"),
                _ => out.push(c),
            }
        } else {
            if c == '"' { in_string = true; }
            out.push(c);
        }
    }
    out
}

fn parsear_json(texto: &str, mensaje_error: &str) -> Result<Value, ApiError> {
    serde_json::from_str::<Value>(texto)
        .or_else(|_| serde_json::from_str::<Value>(&reparar_control_chars_en_cadenas(texto)))
        .map_err(|e| ApiError::bad_request(format!("{mensaje_error}: {e}")))
}

// ==========================================================
// Situación de aprendizaje
// ==========================================================

fn frase_perfil_docente(conn: &Connection) -> Result<String, ApiError> {
    let prefs = preferences::get(conn)?;
    let mut partes = vec![];

    let perfil: Vec<String> = prefs.get("teacherProfile").and_then(Value::as_array)
        .map(|a| a.iter().filter_map(|v| v.as_str().map(str::to_string)).collect())
        .unwrap_or_default();
    if !perfil.is_empty() {
        partes.push(format!("tu estilo como docente: {}", perfil.join("; ")));
    }

    let notas = prefs.get("teacherNotes").and_then(Value::as_str).unwrap_or("").trim().to_string();
    if !notas.is_empty() {
        partes.push(format!("cómo prefieres el material que generas: {notas}"));
    }

    Ok(if partes.is_empty() { String::new() } else { format!(" -- {} --", partes.join(" -- ")) })
}

fn detectar_marcador(texto: &str) -> Option<(&'static str, &'static str)> {
    if texto.contains("### Diapositiva ") {
        return Some(("diapositiva", "### Diapositiva N"));
    }
    if texto.contains("### Página ") {
        return Some(("página", "### Página N"));
    }
    None
}

fn resumir_adaptaciones_neae(conn: &Connection, class_id: Option<&str>) -> Result<Vec<String>, ApiError> {
    let Some(class_id) = class_id else { return Ok(vec![]) };

    let matriculas = enrollments::list(conn, class_id)?;
    let mut contador: BTreeMap<String, i64> = BTreeMap::new();

    for matricula in matriculas.as_array().into_iter().flatten() {
        if let Some(tags) = matricula.get("acneae").and_then(Value::as_array) {
            for tag in tags {
                if let Some(t) = tag.as_str() {
                    *contador.entry(t.to_string()).or_insert(0) += 1;
                }
            }
        }
    }

    Ok(contador.into_iter()
        .map(|(etiqueta, n)| format!("{n} alumno{} con {etiqueta}", if n > 1 { "s" } else { "" }))
        .collect())
}

fn descripcion_tipo_actividad(t: &str) -> Option<&'static str> {
    Some(match t {
        "Exposición/explicación docente" => "el profesorado presenta y desarrolla el contenido de forma directa, con espacio para preguntas.",
        "Trabajo individual" => "el alumnado trabaja de forma autónoma, a su propio ritmo, con un resultado propio.",
        "Trabajo cooperativo/grupal" => "el alumnado trabaja en grupos pequeños con roles o estructura definida, donde el resultado depende de la contribución de todos.",
        "Debate/coloquio" => "confrontación argumentada de puntos de vista sobre una cuestión, moderada por el profesorado.",
        "Aprendizaje basado en proyectos (ABP)" => "el alumnado investiga y produce un resultado tangible a lo largo de varias sesiones, en torno a un reto o pregunta real.",
        "Gamificación" => "mecánicas de juego genuinas (puntos, niveles, retos, misiones, recompensas, competición sana) que hagan la actividad realmente divertida -- no basta con ponerle una etiqueta de \"juego\" a una tarea normal.",
        "Uso de TIC/herramientas digitales" => "herramientas digitales (apps, plataformas online, simuladores...) como parte central de la actividad, no solo de apoyo.",
        "Aprendizaje-servicio" => "un proyecto que combina aprendizaje curricular con un servicio real a la comunidad.",
        "Práctica de laboratorio/taller" => "manipulación directa de materiales o instrumentos para observar, experimentar o construir algo.",
        "Role-play/simulación" => "el alumnado representa un papel o simula una situación real para vivenciarla.",
        "Rutinas y destrezas de pensamiento" => "estructuras breves y repetibles (p.ej. \"veo-pienso-me pregunto\") que guían el pensamiento crítico o creativo sobre un contenido.",
        "Aula invertida (flipped classroom)" => "el alumnado conoce el contenido ANTES de la sesión (vídeo, lectura, web...) de forma autónoma en casa, y la sesión se dedica a aplicar, practicar o resolver dudas sobre ese contenido -- no a explicarlo por primera vez. Solo tiene sentido si el material de casa introduce algo genuinamente nuevo que no se haya explicado ya en una sesión anterior; no la uses como repaso de algo que ya se dio en clase.",
        "Salida de aula o de centro" => "actividad que se realiza fuera del aula habitual (otro espacio del centro, o una salida al exterior).",
        _ => return None,
    })
}

fn etiqueta_estructura_sesion(k: &str) -> &'static str {
    match k {
        "inicio_desarrollo_cierre" => "Inicio-motivación / Desarrollo / Cierre-síntesis en cada sesión.",
        _ => "Decide tú la estructura interna de cada sesión, la que tenga más sentido pedagógico.",
    }
}

fn etiqueta_progresion(k: &str) -> &'static str {
    match k {
        "creciente" => "Creciente -- de más guiado al principio a más autónomo hacia el final.",
        "constante" => "Constante -- el mismo nivel de guía en todas las sesiones.",
        _ => "Decide tú la progresión de autonomía que tenga más sentido.",
    }
}

fn etiqueta_diversidad(k: &str) -> &'static str {
    match k {
        "unica" => "Una única vía de trabajo para todo el grupo.",
        _ => "Actividades diferenciadas de refuerzo/ampliación cuando corresponda.",
    }
}

fn descripcion_formato_examen(t: &str) -> Option<&'static str> {
    Some(match t {
        "Test (opción múltiple)" => "cada pregunta tiene varias opciones cerradas y el alumnado elige una.",
        "Preguntas cortas" => "preguntas concretas de respuesta breve -- una frase o, como mucho, un párrafo corto. NO son preguntas de desarrollo ni piden una redacción extensa.",
        "Preguntas de desarrollo/abiertas" => "preguntas que requieren una respuesta argumentada y extensa, relacionando varias ideas -- no una respuesta breve.",
        "Mixto (test + desarrollo)" => "combina preguntas de test (opción múltiple) con preguntas de desarrollo en el mismo examen.",
        "Prueba práctica/de aplicación" => "el alumnado aplica lo aprendido a un caso, cálculo o problema concreto, no preguntas de memoria.",
        "Oral" => "el alumnado responde de palabra, no por escrito.",
        _ => return None,
    })
}

fn formatear_fecha_dmy(iso: &str) -> Option<String> {
    let fecha = iso.get(0..10)?;
    let partes: Vec<&str> = fecha.split('-').collect();
    if partes.len() != 3 { return None; }
    Some(format!("{}/{}/{}", partes[2], partes[1], partes[0]))
}

pub fn generar_prompt_unidad(conn: &Connection, body: Value) -> Result<Value, ApiError> {
    let course_id = req_str(&body, "course_id")?;
    let documento_texto = req_str(&body, "documento")?;
    let modo = opt_str(&body, "modo").unwrap_or_else(|| "documento".to_string());
    let sesiones_modo = opt_str(&body, "sesiones_modo").unwrap_or_else(|| "ia".to_string());
    let sesiones_fijo = opt_i64(&body, "sesiones_fijo");
    let sesiones_min = opt_i64(&body, "sesiones_min");
    let sesiones_max = opt_i64(&body, "sesiones_max");
    let caracteristicas_grupo = str_list(&body, "caracteristicas_grupo");
    let tipos_actividad = str_list(&body, "tipos_actividad");
    let estructuras_cooperativas = str_list(&body, "estructuras_cooperativas");
    let actividades_obligatorias: Vec<(String, Option<i64>)> = body.get("actividades_obligatorias")
        .and_then(Value::as_array).into_iter().flatten()
        .map(|a| (
            a.get("texto").and_then(Value::as_str).unwrap_or("").trim().to_string(),
            a.get("sesion").and_then(Value::as_i64),
        ))
        .collect();
    let estructura_sesion = opt_str(&body, "estructura_sesion").unwrap_or_else(|| "ia".to_string());
    let estructura_sesion_detalle = opt_str(&body, "estructura_sesion_detalle");
    let progresion_autonomia = opt_str(&body, "progresion_autonomia").unwrap_or_else(|| "ia".to_string());
    let atencion_diversidad = opt_str(&body, "atencion_diversidad").unwrap_or_else(|| "diferenciadas".to_string());
    let atencion_diversidad_detalle = opt_str(&body, "atencion_diversidad_detalle");
    let class_id = opt_str(&body, "class_id");
    let producto_incluido = opt_bool(&body, "producto_incluido", true);
    let producto_tipo = opt_str(&body, "producto_tipo");
    let examen_incluido = opt_bool(&body, "examen_incluido", false);
    let examen_formato = opt_str(&body, "examen_formato");
    let duracion_sesion_min = opt_i64(&body, "duracion_sesion_min").unwrap_or(55);
    let diagnostico_incluido = opt_bool(&body, "diagnostico_incluido", false);
    let diagnostico_minutos = opt_i64(&body, "diagnostico_minutos");

    let curso = courses::get_one(conn, course_id)?
        .ok_or_else(|| ApiError::bad_request("Curso no encontrado."))?;
    let subject = curso["subject"].as_str().unwrap_or("");
    let level = curso["level"].as_str().unwrap_or("");

    if documento_texto.trim().is_empty() {
        return Err(ApiError::bad_request(if modo == "descripcion" { "La descripción está vacía." } else { "El documento está vacío." }));
    }

    let saberes = basic_knowledge::list(conn, course_id)?;
    let criterios = evaluation_criteria::list(conn, course_id)?;
    let saberes_arr = saberes.as_array().cloned().unwrap_or_default();
    let criterios_arr = criterios.as_array().cloned().unwrap_or_default();

    if saberes_arr.is_empty() && criterios_arr.is_empty() {
        return Err(ApiError::bad_request(
            "Este curso no tiene saberes básicos ni criterios de evaluación cargados todavía -- \
añádelos en Ajustes antes de generar una unidad con IA."
        ));
    }

    let lista_saberes = if saberes_arr.is_empty() {
        "(ninguno cargado en este curso)".to_string()
    } else {
        saberes_arr.iter().map(|s| format!("- {}: {}", s["code"].as_str().unwrap_or(""), s["description"].as_str().unwrap_or(""))).collect::<Vec<_>>().join("\n")
    };
    let lista_criterios = if criterios_arr.is_empty() {
        "(ninguno cargado en este curso)".to_string()
    } else {
        criterios_arr.iter().map(|c| format!("- {}: {}", c["code"].as_str().unwrap_or(""), c["description"].as_str().unwrap_or(""))).collect::<Vec<_>>().join("\n")
    };

    let unidades_anteriores = programming_units::list(conn, course_id)?;
    let seccion_sa_anteriores = match unidades_anteriores.as_array() {
        Some(arr) if !arr.is_empty() => {
            let lineas: Vec<String> = arr.iter().map(|u| {
                let fecha = u.get("startDate").and_then(Value::as_str)
                    .and_then(formatear_fecha_dmy)
                    .map(|f| format!(" ({f})")).unwrap_or_default();
                let contexto = u.get("context").and_then(Value::as_str).filter(|s| !s.is_empty())
                    .map(|c| format!(": {c}")).unwrap_or_default();
                format!("- {}{fecha}{contexto}", u["name"].as_str().unwrap_or(""))
            }).collect();
            format!(
                "\n<situaciones_de_aprendizaje_anteriores_del_curso>\nYa se han dado estas situaciones de \
aprendizaje en este mismo curso, de más antigua a más reciente (o sin fecha si todavía no se ha fijado). Es \
lo que el alumnado ya debería saber -- no repitas este contenido, y tenlo en cuenta como base de lo que ya \
se ha trabajado:\n{}\n</situaciones_de_aprendizaje_anteriores_del_curso>\n",
                lineas.join("\n"),
            )
        }
        _ => String::new(),
    };

    let (etiqueta_entrada, instruccion_tarea) = if modo == "descripcion" {
        (
            "descripcion_del_profesor",
            "Todavía no existe un documento de teoría escrito: a partir de la descripción del profesor de \
arriba, redacta tú el desarrollo teórico necesario, siguiéndola con la mayor fidelidad posible -- no te \
salgas de lo que pide ni añadas temas que no haya mencionado, aunque parezcan relacionados. Reparte ese \
desarrollo teórico entre las descripciones de las actividades (ver formato de salida) -- no lo resumas, ese \
es el contenido real que el profesor usará en clase.".to_string(),
        )
    } else {
        let instruccion = match detectar_marcador(documento_texto) {
            Some((unidad_estructural, marcador)) => format!(
                "Diseña una situación de aprendizaje a partir ÚNICAMENTE del contenido del documento de \
teoría. No añadas datos, ejemplos ni conceptos que no aparezcan en él.\n\nEl documento está dividido en \
{unidad_estructural}s numeradas (\"{marcador}\"). NO omitas ninguna, ni siquiera las que te parezcan más \
básicas o introductorias que el resto (por ejemplo: qué es un concepto, su composición, sus funciones o su \
estructura). Antes de dar la respuesta final, repasa la lista completa de {unidad_estructural}s del \
documento y comprueba que cada una está representada en, al menos, una sesión. Si detectas alguna \
{unidad_estructural} sin cubrir, añade o amplía una sesión para incluirla antes de responder.",
            ),
            None => "Diseña una situación de aprendizaje a partir ÚNICAMENTE del contenido del documento de \
teoría. No añadas datos, ejemplos ni conceptos que no aparezcan en él.\n\nNo omitas ningún apartado o bloque \
de contenido del documento, ni siquiera los que te parezcan más básicos o introductorios que el resto. Antes \
de dar la respuesta final, repasa el documento de principio a fin y comprueba que todo su contenido está \
representado en, al menos, una sesión.".to_string(),
        };
        ("documento_de_teoria", instruccion)
    };

    let instruccion_sesiones = if sesiones_modo == "fijo" && sesiones_fijo.is_some() {
        format!("Usa exactamente {} sesiones de clase (una sesión = {duracion_sesion_min} minutos).", sesiones_fijo.unwrap())
    } else if sesiones_modo == "rango" && sesiones_min.is_some() && sesiones_max.is_some() {
        format!(
            "Usa entre {} y {} sesiones de clase (una sesión = {duracion_sesion_min} minutos) -- decide tú \
el número exacto dentro de ese rango según la cantidad de contenido real.",
            sesiones_min.unwrap(), sesiones_max.unwrap(),
        )
    } else {
        format!(
            "Tú decides cuántas sesiones de clase hacen falta (una sesión = {duracion_sesion_min} minutos) \
según la cantidad de contenido real -- no fuerces un número concreto.",
        )
    };

    let seccion_grupo = if caracteristicas_grupo.is_empty() {
        String::new()
    } else {
        format!(
            "\n<contexto_del_grupo>\n{}\n</contexto_del_grupo>\n",
            caracteristicas_grupo.iter().map(|r| format!("- {r}")).collect::<Vec<_>>().join("\n"),
        )
    };

    // ---- Bloque 2: diseño didáctico ----
    let mut partes_diseno: Vec<String> = vec![];

    if !tipos_actividad.is_empty() {
        let lista_tipos = tipos_actividad.iter()
            .map(|t| match descripcion_tipo_actividad(t) {
                Some(desc) => format!("- {t}: {desc}"),
                None => format!("- {t}"),
            })
            .collect::<Vec<_>>().join("\n");
        partes_diseno.push(format!(
            "Tipos de actividad a utilizar:\n{lista_tipos}\n\nRepártelos de forma equilibrada entre las \
sesiones -- no concentres casi todas las actividades en uno de estos tipos dejando los demás como algo \
residual o solo al final. Tampoco al revés: dentro de UNA misma sesión, no fuerces una etiqueta distinta por \
actividad solo por variar -- pocas actividades bien hiladas (p.ej. explicación breve, práctica guiada, \
aplicación, cierre) valen más que cambiar de dinámica en cada una; usa gamificación u otras metodologías \
vistosas solo cuando aporten algo real. Ten en cuenta también el esfuerzo real de preparación para el \
profesor: si vas a proponer varias actividades de un tipo que normalmente exige crear materiales propios \
(gamificación con tableros/cartas/fichas, ABP con documentación extensa, etc.), no te excedas en su número \
ni en la complejidad de esos materiales.",
        ));
    }

    if !estructuras_cooperativas.is_empty() {
        partes_diseno.push(format!(
            "Estructuras cooperativas preferidas (si usas trabajo cooperativo):\n{}",
            estructuras_cooperativas.iter().map(|e| format!("- {e}")).collect::<Vec<_>>().join("\n"),
        ));
    }

    let lineas_obligatorias: Vec<String> = actividades_obligatorias.iter()
        .filter(|(texto, _)| !texto.is_empty())
        .map(|(texto, sesion)| match sesion {
            Some(s) => format!("- {texto} (en la sesión {s})"),
            None => format!("- {texto} (tú decides en qué sesión encaja)"),
        })
        .collect();
    if !lineas_obligatorias.is_empty() {
        partes_diseno.push(format!("Actividades concretas que debes incluir SÍ o SÍ:\n{}", lineas_obligatorias.join("\n")));
    }

    let estructura_sesion_txt = estructura_sesion_detalle.as_deref().filter(|s| !s.is_empty())
        .unwrap_or_else(|| etiqueta_estructura_sesion(&estructura_sesion));
    partes_diseno.push(format!("Estructura interna de cada sesión: {estructura_sesion_txt}"));
    partes_diseno.push(format!("Progresión de autonomía a lo largo de las sesiones: {}", etiqueta_progresion(&progresion_autonomia)));
    let diversidad_txt = atencion_diversidad_detalle.as_deref().filter(|s| !s.is_empty())
        .unwrap_or_else(|| etiqueta_diversidad(&atencion_diversidad));
    partes_diseno.push(format!("Atención a la diversidad: {diversidad_txt}"));

    let adaptaciones_neae = resumir_adaptaciones_neae(conn, class_id.as_deref())?;
    if !adaptaciones_neae.is_empty() {
        partes_diseno.push(format!(
            "Adaptaciones NEAE presentes en el grupo (agregadas, sin identificar a nadie -- cuando una \
actividad necesite una variante para este alumnado, indícala en su campo \"adaptacion\", vacío si esa \
actividad no necesita ninguna):\n{}",
            adaptaciones_neae.iter().map(|a| format!("- {a}")).collect::<Vec<_>>().join("\n"),
        ));
    }

    let seccion_diseno = format!("\n<diseno_didactico>\n{}\n</diseno_didactico>\n", partes_diseno.join("\n\n"));

    // ---- Bloque 3: producto final ----
    let (instruccion_producto, bloque_final_product_json) = if producto_incluido {
        let tipo_clause = producto_tipo.as_deref()
            .map(|t| format!(" de tipo \"{t}\" (ya elegido por el profesor)"))
            .unwrap_or_default();
        let instruccion = format!(
            "1. Una SITUACIÓN DE PARTIDA: un escenario, problema o pregunta real y motivadora que dé \
propósito a toda la unidad (no una lista de contenidos, sino algo que el alumnado pueda reconocer como \
relevante).\n2. Un PRODUCTO FINAL{tipo_clause}: qué va a producir o conseguir el alumnado al terminar la \
unidad que demuestre lo aprendido, coherente con esa situación de partida -- no algo añadido al final sin \
relación con ella.\n\nEl resto de la unidad (sesiones y actividades) tiene que construir progresivamente \
hacia ese producto final, dentro de esa situación -- cada sesión debería dejar algo (una idea, un dato, una \
pieza) que las sesiones siguientes puedan reutilizar para montarlo, en vez de que aparezca de la nada solo \
en la última sesión.",
        );
        let tipo_placeholder = producto_tipo.clone().unwrap_or_else(|| "Tipo de producto (p.ej. Infografía, Vídeo, Maqueta, Dossier, Exposición oral...)".to_string());
        let bloque = format!(
            "\"finalProduct\": {{\n    \"incluido\": true,\n    \"tipo\": \"{tipo_placeholder}\",\n    \
\"descripcion\": \"Descripción del producto final, coherente con la situación de partida\",\n    \
\"linkedCriteriaIds\": [\"códigos de criterios que evidencia el producto\"]\n  }},",
        );
        (instruccion, bloque)
    } else {
        let instruccion = "Una SITUACIÓN DE PARTIDA: un escenario, problema o pregunta real y motivadora que \
dé propósito a toda la unidad (no una lista de contenidos, sino algo que el alumnado pueda reconocer como \
relevante). El profesor ha decidido que esta unidad NO termina en un producto final tangible -- no propongas \
ninguno.\n\nEl resto de la unidad (sesiones y actividades) tiene que construir progresivamente dentro de esa \
situación.".to_string();
        let bloque = "\"finalProduct\": {\"incluido\": false, \"tipo\": null, \"descripcion\": null, \"linkedCriteriaIds\": []},".to_string();
        (instruccion, bloque)
    };

    // ---- Bloque 3: examen final ----
    let (instruccion_examen, bloque_final_exam_json) = if examen_incluido {
        let formato = examen_formato.clone().unwrap_or_default();
        let formato_con_descripcion = match descripcion_formato_examen(&formato) {
            Some(desc) => format!("{formato} ({desc})"),
            None => formato.clone(),
        };
        let instruccion = format!(
            "\n\nEl profesor quiere que la unidad incluya un EXAMEN FINAL con formato \"{formato_con_descripcion}\". \
Diseña sus bloques (uno o más): cada bloque describe qué evalúa y qué criterios de evaluación activa (de la \
lista dada). El examen debe evaluar contenido realmente trabajado en las sesiones diseñadas arriba, no algo \
que no se haya visto en clase. Las preguntas concretas y sus puntos no se diseñan aquí -- el profesor genera \
después el instrumento del examen (con sus preguntas) desde Instrumentos de Evaluación, a partir de estos \
bloques.",
        );
        let bloque = format!(
            "\"finalExam\": {{\n    \"incluido\": true,\n    \"formato\": \"{formato}\",\n    \"bloques\": [\n      {{\n        \
\"descripcion\": \"Qué evalúa este bloque del examen\",\n        \"linkedCriteriaIds\": [\"códigos de \
criterios que activa este bloque\"]\n      }}\n    ]\n  }},",
        );
        (instruccion, bloque)
    } else {
        (String::new(), "\"finalExam\": {\"incluido\": false, \"formato\": null, \"bloques\": []},".to_string())
    };

    let instruccion_diagnostico = if diagnostico_incluido && diagnostico_minutos.is_some() {
        format!(
            "\nLa PRIMERA sesión debe reservar sus primeros {} minutos para una actividad de diagnóstico de \
conocimientos previos: comprueba lo que el alumnado ya debería saber de las situaciones de aprendizaje \
anteriores de este curso (ver más abajo si las hay). El resto de esa sesión y las siguientes se dedican al \
contenido nuevo de esta unidad.\n",
            diagnostico_minutos.unwrap(),
        )
    } else {
        String::new()
    };

    let frase_perfil = frase_perfil_docente(conn)?;
    let origen = if modo == "documento" { "tu propio material de clase" } else { "lo que quieres trabajar" };
    let frase_grupo_sesiones = if caracteristicas_grupo.is_empty() { "" } else { "Ten en cuenta las características del grupo dadas arriba al diseñar las sesiones." };
    let frase_modo_actividad = if modo == "descripcion" { "aquí va el contenido teórico que redactes, no un resumen" } else { "fiel al documento" };
    let frase_producto_criterios = if producto_incluido { "- Los criterios de evaluación que evidencia el producto final (de la lista dada, cero o más)." } else { "" };

    let prompt = format!(
        "Eres un profesor de {subject} de {level}{frase_perfil} diseñando una situación \
de aprendizaje a partir de {origen}.

<{etiqueta_entrada}>
{documento_texto}
</{etiqueta_entrada}>

<curriculo_oficial_del_curso>
SABERES BÁSICOS (usa solo estos códigos, ninguno más):
{lista_saberes}

CRITERIOS DE EVALUACIÓN (usa solo estos códigos, ninguno más):
{lista_criterios}
</curriculo_oficial_del_curso>

IMPORTANTE, son dos listas de códigos DISTINTAS y NO se mezclan nunca: los saberes suelen tener formato \
LETRA.NÚMERO (p.ej. \"A.1\", \"C.3\") y los criterios NÚMERO.NÚMERO (p.ej. \"1.1\", \"3.2\"), pero el formato puede variar \
de un curso a otro -- lo que nunca cambia es que cada código pertenece a UNA sola de las dos listas de arriba. \
Todo campo \"linkedCriteriaIds\" va EXCLUSIVAMENTE con códigos de la lista de CRITERIOS DE EVALUACIÓN -- nunca con \
códigos de la lista de saberes, aunque parezcan relacionados con lo que se está evaluando. Antes de escribir cada \
código, comprueba en qué lista de arriba aparece tal cual.
{seccion_grupo}{seccion_diseno}{seccion_sa_anteriores}
<tarea>
{instruccion_tarea}

Antes de diseñar nada más, decide esto -- es lo que da sentido al resto:
{instruccion_producto}{instruccion_examen}
{instruccion_diagnostico}
Reparte el contenido en sesiones de clase, cubriendo todo el contenido de principio a fin, \
en el orden que tenga más sentido pedagógico. Cada sesión tiene que aportar de forma reconocible a la \
situación de partida decidida arriba -- no un desarrollo de contenido genérico que podría pertenecer a \
cualquier unidad sobre el tema. {instruccion_sesiones}
{frase_grupo_sesiones}

Para cada sesión, repártela en una o más actividades siguiendo el diseño didáctico de arriba. \
Para cada actividad:
- Un título breve.
- El tipo de actividad (de los tipos dados).
- El agrupamiento: individual, parejas, pequeño_grupo o gran_grupo.
- Duración en minutos (deben sumar, aproximadamente, la duración de la sesión) -- cuenta el tiempo real de aula \
con alumnado real, no solo el trabajo intelectual puro: explicar la consigna, organizar agrupamientos, repartir \
y recoger materiales y las transiciones entre actividades también consumen minutos reales. No diseñes la sesión \
como si cada actividad se ejecutara al instante y sin fricción -- si el reparto queda demasiado ajustado, reduce \
el número de actividades en vez de comprimir estos tiempos.
- Recursos necesarios, si aplica.
- Una descripción real y desarrollada de la actividad -- {frase_modo_actividad}.
- Los criterios de evaluación que activa (de la lista dada, cero o más -- solo si esta actividad concreta lo \
evidencia de verdad, no para dar cobertura o porque \"encaje en general\" con el tema).
- Una adaptación para atender a la diversidad del grupo, solo si esa actividad concreta lo necesita (deja el campo vacío si no).

Ojo, no basta con que los minutos cuadren: la CANTIDAD de trabajo que le pides al alumnado dentro de esa actividad \
tiene que caber de verdad en ese tiempo con alumnado real, no ideal -- construir y presentar varios productos, \
identificar muchos elementos, o completar varias tareas seguidas en pocos minutos es sobrecarga aunque la resta \
de minutos salga bien. Si una actividad pide demasiado para su duración, reduce lo que se pide (menos elementos, \
menos productos, menos exposiciones) en vez de solo ajustar el número de minutos.

Además, para la unidad completa:
- Los saberes básicos que activa en conjunto (de la lista dada, cero o más -- dejar vacío si \
ninguno encaja de verdad es preferible a forzar uno).
- Los criterios de evaluación que activa en conjunto (mismo criterio: solo de la lista dada).
{frase_producto_criterios}

No cites normativa, decretos ni URLs. No inventes códigos curriculares fuera de \
las dos listas dadas arriba -- si lo haces, esos códigos se descartarán al guardar \
la unidad.
</tarea>

<formato_de_salida>
Devuelve ÚNICAMENTE un JSON con esta forma exacta, sin texto antes ni después:

{{
  \"name\": \"Nombre breve de la unidad\",
  \"context\": \"La situación de partida: el escenario, problema o pregunta real que da sentido a la unidad\",
  {bloque_final_product_json}
  {bloque_final_exam_json}
  \"sessions\": <número de sesiones>,
  \"sessionDetails\": [
    {{
      \"titulo\": \"Título de la sesión\",
      \"actividades\": [
        {{
          \"titulo\": \"Título de la actividad\",
          \"tipo\": \"Tipo de actividad\",
          \"agrupamiento\": \"individual | parejas | pequeño_grupo | gran_grupo\",
          \"duracionMin\": <minutos>,
          \"recursos\": [\"recurso 1\", \"recurso 2\"],
          \"descripcion\": \"Descripción real y desarrollada de la actividad\",
          \"linkedCriteriaIds\": [\"códigos de criterios que activa esta actividad\"],
          \"adaptacion\": \"Adaptación para la diversidad, o cadena vacía si no aplica\"
        }}
      ]
    }}
  ],
  \"linkedBasicKnowledgeIds\": [\"códigos de saberes usados en conjunto, sin repetir\"],
  \"linkedCriteriaIds\": [\"códigos de criterios usados en conjunto, sin repetir\"]
}}
</formato_de_salida>",
    );

    // Mapa siempre vacío (ver nota de cabecera de construir_prompt en
    // situacion_aprendizaje.py: el documento de teoría no pasa por
    // anonimizar()) -- se mantiene en la respuesta por la misma forma que
    // el resto de Herramientas IA, sin ninguna sustitución real.
    Ok(json!({"prompt": prompt, "mapa": {}}))
}

fn mapear_criterios(
    codigos: Option<&Value>,
    criterios_por_codigo: &HashMap<String, (String, String)>,
    codigos_descartados: &mut Vec<String>,
    competencias_usadas: &mut BTreeSet<String>,
) -> Vec<String> {
    let mut ids = vec![];
    for codigo_v in codigos.and_then(Value::as_array).into_iter().flatten() {
        if let Some(codigo) = codigo_v.as_str() {
            match criterios_por_codigo.get(codigo) {
                Some((id, competence_id)) => {
                    ids.push(id.clone());
                    competencias_usadas.insert(competence_id.clone());
                }
                None => codigos_descartados.push(codigo.to_string()),
            }
        }
    }
    ids
}

fn reintegrar_texto(texto: &str, mapa: &serde_json::Map<String, Value>) -> String {
    if texto.is_empty() || mapa.is_empty() { return texto.to_string(); }
    let mut resultado = texto.to_string();
    for (codigo, real) in mapa {
        if let Some(real_str) = real.as_str() {
            resultado = resultado.replace(codigo.as_str(), real_str);
        }
    }
    resultado
}

pub fn validar_unidad(conn: &Connection, body: Value) -> Result<Value, ApiError> {
    let course_id = req_str(&body, "course_id")?;
    let respuesta_texto = body.get("respuesta").and_then(Value::as_str).unwrap_or("");
    let mapa = body.get("mapa").and_then(Value::as_object).cloned().unwrap_or_default();

    let datos = parsear_json(&extraer_json(respuesta_texto), "La respuesta pegada no es JSON válido")?;

    let saberes_por_codigo: HashMap<String, String> = basic_knowledge::list(conn, course_id)?
        .as_array().into_iter().flatten()
        .filter_map(|s| Some((s.get("code")?.as_str()?.to_string(), s.get("id")?.as_str()?.to_string())))
        .collect();

    let criterios_por_codigo: HashMap<String, (String, String)> = evaluation_criteria::list(conn, course_id)?
        .as_array().into_iter().flatten()
        .filter_map(|c| Some((
            c.get("code")?.as_str()?.to_string(),
            (c.get("id")?.as_str()?.to_string(), c.get("competenceId")?.as_str()?.to_string()),
        )))
        .collect();

    let mut codigos_descartados: Vec<String> = vec![];
    let mut competencias_usadas: BTreeSet<String> = BTreeSet::new();

    let mut ids_saberes: Vec<String> = vec![];
    for codigo_v in datos.get("linkedBasicKnowledgeIds").and_then(Value::as_array).into_iter().flatten() {
        if let Some(codigo) = codigo_v.as_str() {
            match saberes_por_codigo.get(codigo) {
                Some(id) => ids_saberes.push(id.clone()),
                None => codigos_descartados.push(codigo.to_string()),
            }
        }
    }

    let ids_criterios = mapear_criterios(datos.get("linkedCriteriaIds"), &criterios_por_codigo, &mut codigos_descartados, &mut competencias_usadas);

    let mut session_details: Vec<Value> = vec![];
    for sesion in datos.get("sessionDetails").and_then(Value::as_array).into_iter().flatten() {
        let mut actividades: Vec<Value> = vec![];
        for act in sesion.get("actividades").and_then(Value::as_array).into_iter().flatten() {
            actividades.push(json!({
                "titulo": reintegrar_texto(act.get("titulo").and_then(Value::as_str).unwrap_or(""), &mapa),
                "tipo": act.get("tipo").and_then(Value::as_str),
                "agrupamiento": act.get("agrupamiento").and_then(Value::as_str),
                "duracionMin": act.get("duracionMin").cloned().unwrap_or(Value::Null),
                "recursos": act.get("recursos").cloned().unwrap_or_else(|| json!([])),
                "descripcion": reintegrar_texto(act.get("descripcion").and_then(Value::as_str).unwrap_or(""), &mapa),
                "linkedCriteriaIds": mapear_criterios(act.get("linkedCriteriaIds"), &criterios_por_codigo, &mut codigos_descartados, &mut competencias_usadas),
                "adaptacion": ({
                    let a = reintegrar_texto(act.get("adaptacion").and_then(Value::as_str).unwrap_or(""), &mapa);
                    if a.is_empty() { Value::Null } else { Value::String(a) }
                }),
            }));
        }

        // Compatibilidad con el esquema plano antiguo ("description" suelto).
        if actividades.is_empty() {
            if let Some(desc) = sesion.get("description").and_then(Value::as_str).filter(|s| !s.is_empty()) {
                actividades.push(json!({
                    "titulo": "", "tipo": Value::Null, "agrupamiento": Value::Null, "duracionMin": Value::Null,
                    "recursos": [], "descripcion": reintegrar_texto(desc, &mapa),
                    "linkedCriteriaIds": Value::Array(vec![]), "adaptacion": Value::Null,
                }));
            }
        }

        session_details.push(json!({
            "titulo": reintegrar_texto(sesion.get("titulo").and_then(Value::as_str).unwrap_or(""), &mapa),
            "actividades": actividades,
        }));
    }

    let producto_datos = datos.get("finalProduct").cloned().unwrap_or_else(|| json!({}));
    let producto_desc = reintegrar_texto(producto_datos.get("descripcion").and_then(Value::as_str).unwrap_or(""), &mapa);
    let final_product = json!({
        "incluido": producto_datos.get("incluido").and_then(Value::as_bool).unwrap_or(false),
        "tipo": producto_datos.get("tipo").and_then(Value::as_str),
        "descripcion": if producto_desc.is_empty() { Value::Null } else { Value::String(producto_desc) },
        "linkedCriteriaIds": mapear_criterios(producto_datos.get("linkedCriteriaIds"), &criterios_por_codigo, &mut codigos_descartados, &mut competencias_usadas),
    });

    let examen_datos = datos.get("finalExam").cloned().unwrap_or_else(|| json!({}));
    let mut bloques_examen: Vec<Value> = vec![];
    for bloque in examen_datos.get("bloques").and_then(Value::as_array).into_iter().flatten() {
        bloques_examen.push(json!({
            "descripcion": reintegrar_texto(bloque.get("descripcion").and_then(Value::as_str).unwrap_or(""), &mapa),
            "linkedCriteriaIds": mapear_criterios(bloque.get("linkedCriteriaIds"), &criterios_por_codigo, &mut codigos_descartados, &mut competencias_usadas),
        }));
    }
    let final_exam = json!({
        "incluido": examen_datos.get("incluido").and_then(Value::as_bool).unwrap_or(false),
        "formato": examen_datos.get("formato").and_then(Value::as_str),
        "bloques": bloques_examen,
    });

    let sessions = datos.get("sessions").and_then(Value::as_i64).unwrap_or(session_details.len() as i64);

    let unidad = json!({
        "name": reintegrar_texto(datos.get("name").and_then(Value::as_str).unwrap_or(""), &mapa),
        "context": reintegrar_texto(datos.get("context").and_then(Value::as_str).unwrap_or(""), &mapa),
        "sessions": sessions,
        "sessionDetails": session_details,
        "finalProduct": final_product,
        "finalExam": final_exam,
        "linkedBasicKnowledgeIds": ids_saberes,
        "linkedCriteriaIds": ids_criterios,
        "linkedSpecificCompetenceIds": competencias_usadas.into_iter().collect::<Vec<_>>(),
    });

    Ok(json!({"unidad": unidad, "codigosDescartados": codigos_descartados}))
}

// ==========================================================
// Instrumento de evaluación
// ==========================================================

fn etiqueta_tipo_instrumento(t: &str) -> Option<&'static str> {
    Some(match t {
        "checklist" => "Lista de cotejo",
        "rating_scale" => "Escala de valoración",
        "rubric" => "Rúbrica",
        "criterial_exam" => "Examen criterial",
        _ => return None,
    })
}

fn instruccion_tipo_instrumento(tool_type: &str, n: i64) -> String {
    match tool_type {
        "checklist" => "Una lista de ítems observables (\"se ha hecho o no\", sin niveles de desempeño). Cada \
ítem: una descripción breve de lo que se comprueba, un peso relativo (weight -- un número libre, más peso \
significa que ese ítem importa más en la nota final), y los criterios de evaluación que evidencia.".to_string(),
        "rating_scale" => format!(
            "{n} niveles de desempeño genéricos que aplican por igual a todos los ítems (p.ej. \"No conseguido\", \
\"En proceso\", \"Conseguido\", \"Superado\"...) y una lista de ítems. Cada ítem: una descripción breve de lo que \
se evalúa, un peso relativo (weight), y los criterios de evaluación que evidencia.",
        ),
        "rubric" => format!(
            "{n} niveles de desempeño y una lista de ítems (las filas de la rúbrica). Cada ítem: una descripción \
breve del aspecto que evalúa, un peso relativo (weight), los criterios de evaluación que evidencia, y una \
descripción ESPECÍFICA de cómo se ve el desempeño en CADA nivel para ese ítem concreto (levelDescriptions) -- \
no una frase genérica repetida, sino qué distingue de verdad a un nivel de otro para ese ítem.",
        ),
        _ => "Una lista de preguntas de examen. Cada pregunta: un enunciado breve, sus puntos máximos reales \
(weight -- p.ej. 2 o 2.5, el valor real de la pregunta en el examen, no una importancia abstracta), y los \
criterios de evaluación que evidencia.".to_string(),
    }
}

pub fn generar_prompt_instrumento(conn: &Connection, body: Value) -> Result<Value, ApiError> {
    let course_id = req_str(&body, "course_id")?;
    let tool_type = req_str(&body, "tool_type")?;
    let criterion_ids = str_list(&body, "criterion_ids");
    let contexto = opt_str(&body, "contexto");
    let num_niveles = opt_i64(&body, "num_niveles");
    let documento_clase = opt_str(&body, "documento");

    let etiqueta_tipo = etiqueta_tipo_instrumento(tool_type)
        .ok_or_else(|| ApiError::bad_request(format!("Tipo de instrumento desconocido: {tool_type}")))?;

    let curso = courses::get_one(conn, course_id)?
        .ok_or_else(|| ApiError::bad_request("Curso no encontrado."))?;
    let subject = curso["subject"].as_str().unwrap_or("");
    let level = curso["level"].as_str().unwrap_or("");

    let todos_los_criterios = evaluation_criteria::list(conn, course_id)?;
    let todos_arr = todos_los_criterios.as_array().cloned().unwrap_or_default();

    let (criterios, instruccion_criterios, instruccion_cobertura) = if !criterion_ids.is_empty() {
        let ids_pedidos: std::collections::HashSet<&str> = criterion_ids.iter().map(String::as_str).collect();
        let criterios: Vec<Value> = todos_arr.iter().filter(|c| c["id"].as_str().map(|id| ids_pedidos.contains(id)).unwrap_or(false)).cloned().collect();
        if criterios.is_empty() {
            return Err(ApiError::bad_request(
                "Ninguno de los criterios indicados existe en este curso -- vincula al menos un criterio antes de generar el instrumento."
            ));
        }
        let cobertura = format!(
            "Reparte los criterios dados entre {} de forma equilibrada -- que cada criterio quede cubierto por \
al menos uno, sin forzar {} que no aporten nada real.",
            if tool_type == "criterial_exam" { "las preguntas" } else { "los ítems" },
            if tool_type == "criterial_exam" { "preguntas" } else { "ítems" },
        );
        (criterios, "Debe cubrir estos criterios de evaluación (usa SOLO estos códigos, ninguno más):".to_string(), cobertura)
    } else {
        if todos_arr.is_empty() {
            return Err(ApiError::bad_request(
                "Este curso no tiene criterios de evaluación cargados todavía -- añádelos en Ajustes antes de generar un instrumento."
            ));
        }
        if contexto.is_none() && documento_clase.is_none() {
            return Err(ApiError::bad_request(
                "Sin criterios elegidos a mano, hace falta describir qué quieres evaluar (o pegar el contenido visto en clase) para que la IA sepa de dónde partir."
            ));
        }
        let cobertura = format!(
            "Vincula cada {} SOLO a los criterios que de verdad evidencia -- no hace falta cubrir todos los de \
la lista, elige los que encajen con lo descrito arriba, no fuerces relaciones que no existan.",
            if tool_type == "criterial_exam" { "pregunta" } else { "ítem" },
        );
        (todos_arr.clone(), "Elige de esta lista SOLO los criterios que de verdad encajan con lo que se describe arriba (usa SOLO estos códigos, ninguno más):".to_string(), cobertura)
    };

    let lista_criterios = criterios.iter().map(|c| format!("- {}: {}", c["code"].as_str().unwrap_or(""), c["description"].as_str().unwrap_or(""))).collect::<Vec<_>>().join("\n");

    let necesita_niveles = matches!(tool_type, "rating_scale" | "rubric");
    let n = num_niveles.unwrap_or(4);
    let instruccion_tipo = instruccion_tipo_instrumento(tool_type, n);
    let _ = necesita_niveles;

    let seccion_contexto = contexto.as_deref().map(|c| format!("\nLo que se va a evaluar con este instrumento: {c}\n")).unwrap_or_default();
    // Mismo criterio que api/app/services/prompts/instrumento_evaluacion.py:
    // sin esto, "contexto" era decorativo -- nada obligaba a la IA a
    // basarse en él, así que un contexto largo (el enunciado real de un
    // examen pegado tal cual) podía acabar ignorado en favor de una
    // elaboración genérica de la descripción de cada criterio.
    let instruccion_contexto = if contexto.is_some() {
        "\nBasa el instrumento en lo descrito arriba (\"Lo que se va a evaluar con este instrumento\") -- si \
ahí se ha pegado contenido real (el enunciado de un examen, la descripción de un producto...), las \
preguntas/ítems tienen que ajustarse a eso concretamente, no ser una elaboración genérica de la descripción \
de cada criterio."
    } else { "" };
    let seccion_documento = documento_clase.as_deref().map(|d| format!("\n<contenido_visto_en_clase>\n{d}\n</contenido_visto_en_clase>\n")).unwrap_or_default();
    let instruccion_documento = if documento_clase.is_some() {
        "\nBasa el instrumento en el contenido de <contenido_visto_en_clase> -- las preguntas/ítems tienen que \
ser sobre lo que realmente se ha trabajado ahí, no una elaboración genérica de la descripción de cada criterio."
    } else { "" };

    let formato = match tool_type {
        "checklist" | "criterial_exam" => "{\n  \"name\": \"Nombre breve del instrumento\",\n  \"items\": [\n    \
{\"description\": \"...\", \"weight\": 1, \"linkedCriteriaIds\": [\"códigos de criterios\"]}\n  ]\n}".to_string(),
        "rating_scale" => "{\n  \"name\": \"Nombre breve del instrumento\",\n  \"levels\": [{\"name\": \"Nombre \
del nivel\", \"points\": 1}],\n  \"items\": [\n    {\"description\": \"...\", \"weight\": 1, \
\"linkedCriteriaIds\": [\"códigos de criterios\"]}\n  ]\n}".to_string(),
        _ => "{\n  \"name\": \"Nombre breve del instrumento\",\n  \"levels\": [{\"name\": \"Nombre del nivel\", \
\"points\": 1}],\n  \"items\": [\n    {\n      \"description\": \"...\",\n      \"weight\": 1,\n      \
\"linkedCriteriaIds\": [\"códigos de criterios\"],\n      \"levelDescriptions\": {\"Nombre del nivel\": \"Cómo \
se ve este ítem en ese nivel concreto\"}\n    }\n  ]\n}".to_string(),
    };

    let prompt = format!(
        "Eres un profesor de {subject} de {level} diseñando un instrumento de \
evaluación de tipo {etiqueta_tipo}.
{seccion_contexto}{seccion_documento}
<criterios_de_evaluacion>
{instruccion_criterios}
{lista_criterios}
</criterios_de_evaluacion>

<tarea>
{instruccion_tipo}

{instruccion_cobertura} No inventes criterios fuera de la lista dada -- si lo haces, esos \
códigos se descartarán al procesar la respuesta.{instruccion_contexto}{instruccion_documento}
</tarea>

<formato_de_salida>
Devuelve ÚNICAMENTE este JSON, sin texto antes ni después. Si hay niveles, usa el NOMBRE del \
nivel (no un id) como clave de \"levelDescriptions\":

{formato}
</formato_de_salida>",
    );

    Ok(json!({"prompt": prompt}))
}

pub fn validar_instrumento(conn: &Connection, body: Value) -> Result<Value, ApiError> {
    let course_id = req_str(&body, "course_id")?;
    let tool_type = req_str(&body, "tool_type")?;
    let respuesta_texto = body.get("respuesta").and_then(Value::as_str).unwrap_or("");

    let datos = parsear_json(&extraer_json(respuesta_texto), "La IA no devolvió un JSON válido")?;

    let criterios_por_codigo: HashMap<String, String> = evaluation_criteria::list(conn, course_id)?
        .as_array().into_iter().flatten()
        .filter_map(|c| Some((c.get("code")?.as_str()?.to_string(), c.get("id")?.as_str()?.to_string())))
        .collect();
    let mut codigos_descartados: Vec<String> = vec![];

    let mapear_ids = |codigos: Option<&Value>, codigos_descartados: &mut Vec<String>| -> Vec<String> {
        let mut ids = vec![];
        for codigo_v in codigos.and_then(Value::as_array).into_iter().flatten() {
            if let Some(codigo) = codigo_v.as_str() {
                match criterios_por_codigo.get(codigo) {
                    Some(id) => ids.push(id.clone()),
                    None => codigos_descartados.push(codigo.to_string()),
                }
            }
        }
        ids
    };

    let mut niveles_por_nombre: HashMap<String, String> = HashMap::new();
    let mut levels_out: Vec<Value> = vec![];
    for (i, lvl) in datos.get("levels").and_then(Value::as_array).into_iter().flatten().enumerate() {
        let nombre = lvl.get("name").and_then(Value::as_str).filter(|s| !s.is_empty())
            .map(str::to_string).unwrap_or_else(|| format!("Nivel {}", i + 1));
        let level_id = format!("lvl-{i}");
        niveles_por_nombre.insert(nombre.clone(), level_id.clone());
        levels_out.push(json!({
            "id": level_id, "name": nombre,
            "points": lvl.get("points").cloned().unwrap_or_else(|| json!(i)),
        }));
    }

    let mut items_out: Vec<Value> = vec![];
    for (i, item) in datos.get("items").and_then(Value::as_array).into_iter().flatten().enumerate() {
        let mut item_out = json!({
            "id": format!("item-{i}"),
            "description": item.get("description").and_then(Value::as_str).unwrap_or(""),
            "weight": item.get("weight").cloned().unwrap_or_else(|| json!(1)),
            "linkedCriteriaIds": mapear_ids(item.get("linkedCriteriaIds"), &mut codigos_descartados),
        });
        if tool_type == "rubric" {
            let mut descripciones_out = serde_json::Map::new();
            for (nombre, descripcion) in item.get("levelDescriptions").and_then(Value::as_object).into_iter().flatten() {
                if let Some(level_id) = niveles_por_nombre.get(nombre) {
                    descripciones_out.insert(level_id.clone(), descripcion.clone());
                }
            }
            item_out["levelDescriptions"] = Value::Object(descripciones_out);
        }
        items_out.push(item_out);
    }

    let etiqueta_tipo = etiqueta_tipo_instrumento(tool_type).unwrap_or(tool_type);
    let nombre = datos.get("name").and_then(Value::as_str).filter(|s| !s.is_empty()).unwrap_or(etiqueta_tipo);

    let mut instrumento = json!({
        "type": tool_type,
        "name": nombre,
        "items": items_out,
    });
    if matches!(tool_type, "rating_scale" | "rubric") {
        instrumento["levels"] = Value::Array(levels_out);
    }

    Ok(json!({"instrumento": instrumento, "codigosDescartados": codigos_descartados}))
}

// Puerto de api/app/services/prompts/adaptacion_material.py::construir_prompt().
// A diferencia del resto de generadores, la entrada YA viene anonimizada por
// el profesor a mano (no hay Anonimizador en escritorio, ver
// project_tauri_ia_scope.md) y la respuesta pegada se usa tal cual, sin un
// paso de "validar" aparte -- por eso solo hace falta esta función, ninguna
// `validar_adaptacion_material`.
pub fn generar_prompt_adaptacion_material(_conn: &Connection, body: Value) -> Result<Value, ApiError> {
    let material = req_str(&body, "material")?;
    let notas_alumno = body.get("notas_alumno").and_then(Value::as_str).unwrap_or("");

    let prompt = format!(
        "Eres un profesor de apoyo especializado en adaptar materiales didácticos para \
alumnado con necesidades específicas de apoyo educativo (NEAE), alumnado repetidor o con \
programas específicos.

<material_original>
{material}
</material_original>

<indicaciones_para_ti_sobre_como_adaptar>
Esto NO son peticiones del alumno ni contenido de la tarea -- son pautas dirigidas A TI, el \
profesor de apoyo, para que decidas CÓMO reescribir <material_original>. No cites estas \
indicaciones, no las repitas, no las conviertas en parte del enunciado ni en algo que el alumno \
lea: son información de fondo tuya, invisible para él.

{notas_alumno}
</indicaciones_para_ti_sobre_como_adaptar>

<tarea>
<material_original> es un enunciado/actividad TODAVÍA SIN HACER que el alumno va a recibir \
directamente, tal cual escribas tu respuesta -- no es un encargo para que OTRA persona (el \
alumno, otro profesor...) haga la adaptación, LA ADAPTACIÓN LA HACES TÚ AHORA MISMO, en tu \
respuesta, usando <indicaciones_para_ti_sobre_como_adaptar> solo como guía de trabajo, nunca \
como texto a incluir. Escribe el resultado exactamente en la misma forma que el original (un \
enunciado de actividad, una pregunta de examen, un texto explicativo...) -- nunca una lista de \
instrucciones sobre cómo adaptarlo, ni una explicación de qué cambios has hecho, ni una frase \
dirigida a \"el alumno\" o \"el profesor\" pidiendo que alguien haga algo con el material. El alumno \
debe leer el resultado y ponerse directamente a trabajar en él, sin enterarse de que ha sido \
adaptado para él -- no menciones NEAE, necesidades, diagnósticos ni el PTI en el texto que \
entregues.

Dos límites igual de importantes:
1. NO resuelvas ni completes la tarea tú: no rellenes tablas con respuestas, no contestes las \
   preguntas que plantea, no hagas tú el procedimiento/experimento/ejercicio descrito. El alumno \
   debe seguir teniendo que hacer exactamente la misma tarea de fondo (las mismas preguntas, los \
   mismos pasos, el mismo objetivo de aprendizaje) -- una tabla para rellenar sigue vacía en tu \
   resultado.
2. Ajusta SOLO cómo se plantea: vocabulario más sencillo, frases más cortas, instrucciones más \
   estructuradas (p.ej. en pasos numerados), o el formato si hace falta (p.ej. una tabla en vez \
   de un párrafo largo). Si toca añadir apoyo visual, INSÉRTALO tú mismo directamente en el \
   texto -- un emoji o pictograma junto a cada paso (p.ej. \"💧 Mide la humedad del suelo\") -- en \
   vez de escribir una instrucción sobre ello (nunca frases como \"usa un pictograma de 💧\" o \
   \"añade aquí un icono\"): el propio emoji ya es el apoyo visual, no algo que el alumno tenga que \
   buscar o poner él.

No inventes datos personales nuevos (nombres, edades, diagnósticos...) que no estén ya en \
<indicaciones_para_ti_sobre_como_adaptar>. Si aparecen códigos como PERS_XXXXXX o GRUPO_XXXXXX, son anonimización \
real de datos personales -- déjalos EXACTAMENTE igual en el resultado, no los traduzcas ni los \
elimines.
</tarea>

<formato_de_salida>
Devuelve ÚNICAMENTE el enunciado ya adaptado, listo para entregar al alumno tal cual, en texto/ \
Markdown plano -- sin explicaciones antes ni después, sin envolverlo en bloques de código, sin \
ninguna respuesta/solución/dato relleno que el alumno tenga que aportar él mismo, y sin ninguna \
mención a que el texto ha sido adaptado o a las necesidades del alumno.
</formato_de_salida>"
    );

    Ok(json!({"prompt": prompt}))
}

// Puerto de api/app/services/prompts/deteccion_curricular.py.
fn elementos_por_tipo(conn: &Connection, course_id: &str, tipo: &str) -> Result<Vec<(String, String, String)>, ApiError> {
    let extraer = |v: Value| -> Vec<(String, String, String)> {
        v.as_array().into_iter().flatten()
            .filter_map(|e| Some((
                e.get("id")?.as_str()?.to_string(),
                e.get("code")?.as_str()?.to_string(),
                e.get("description")?.as_str()?.to_string(),
            )))
            .collect()
    };
    match tipo {
        "criterios" => Ok(extraer(evaluation_criteria::list(conn, course_id)?)),
        "saberes" => Ok(extraer(basic_knowledge::list(conn, course_id)?)),
        "competencias_especificas" => Ok(extraer(specific_competences::list(conn, course_id)?)),
        // Las competencias clave son globales (sin course_id) -- se listan
        // todas, y se aplanan también sus descriptores operativos como
        // elementos detectables aparte, cada uno con su propio código real.
        "competencias_clave" => {
            let mut elementos = vec![];
            for kc in key_competences::list(conn)?.as_array().into_iter().flatten() {
                if let (Some(id), Some(code), Some(desc)) = (
                    kc.get("id").and_then(Value::as_str),
                    kc.get("code").and_then(Value::as_str),
                    kc.get("description").and_then(Value::as_str),
                ) {
                    elementos.push((id.to_string(), code.to_string(), desc.to_string()));
                }
                for d in kc.get("descriptors").and_then(Value::as_array).into_iter().flatten() {
                    if let (Some(id), Some(code), Some(desc)) = (
                        d.get("id").and_then(Value::as_str),
                        d.get("code").and_then(Value::as_str),
                        d.get("description").and_then(Value::as_str),
                    ) {
                        elementos.push((id.to_string(), code.to_string(), desc.to_string()));
                    }
                }
            }
            Ok(elementos)
        }
        _ => Err(ApiError::bad_request(format!("Tipo de elemento curricular desconocido: {tipo}"))),
    }
}

fn etiqueta_tipo_curricular(tipo: &str) -> Option<&'static str> {
    match tipo {
        "criterios" => Some("Criterios de evaluación"),
        "saberes" => Some("Saberes básicos"),
        "competencias_especificas" => Some("Competencias específicas"),
        "competencias_clave" => Some("Competencias clave / descriptores operativos"),
        _ => None,
    }
}

fn seccion_tipo_curricular(tipo: &str) -> &'static str {
    match tipo {
        "criterios" => "criterios_de_evaluacion",
        "saberes" => "saberes_basicos",
        "competencias_especificas" => "competencias_especificas",
        "competencias_clave" => "competencias_clave",
        _ => "elementos",
    }
}

pub fn generar_prompt_deteccion_curricular(conn: &Connection, body: Value) -> Result<Value, ApiError> {
    let course_id = req_str(&body, "course_id")?;
    let documento = req_str(&body, "documento")?;
    let tipos = str_list(&body, "tipos");

    if tipos.is_empty() {
        return Err(ApiError::bad_request("Elige al menos un tipo de elemento curricular a detectar."));
    }

    let curso = courses::get_one(conn, course_id)?
        .ok_or_else(|| ApiError::bad_request("Curso no encontrado."))?;
    let subject = curso["subject"].as_str().unwrap_or("");
    let level = curso["level"].as_str().unwrap_or("");

    let mut secciones: Vec<String> = vec![];
    for tipo in &tipos {
        let elementos = elementos_por_tipo(conn, course_id, tipo)?;
        if elementos.is_empty() { continue; }
        let etiqueta_seccion = seccion_tipo_curricular(tipo);
        let lista = elementos.iter().map(|(_id, code, description)| format!("- {code}: {description}")).collect::<Vec<_>>().join("\n");
        secciones.push(format!("<{etiqueta_seccion}>\n{lista}\n</{etiqueta_seccion}>"));
    }

    if secciones.is_empty() {
        return Err(ApiError::bad_request(
            "Este curso no tiene cargado ningún elemento curricular de los tipos elegidos -- añádelos en Ajustes antes de usar esta herramienta."
        ));
    }

    let etiquetas_elegidas = tipos.iter().filter_map(|t| etiqueta_tipo_curricular(t)).collect::<Vec<_>>().join(", ");
    let secciones_txt = secciones.join("\n\n");

    let prompt = format!(
        "Eres un profesor de {subject} de {level} revisando un documento propio \
(apuntes, descripción de actividades...) para identificar qué elementos curriculares moviliza de \
verdad, de estos tipos: {etiquetas_elegidas}.

<documento>
{documento}
</documento>

{secciones_txt}

<tarea>
Devuelve el MISMO documento, sin resumirlo ni reescribirlo (puedes ajustar puntuación mínima si \
hace falta para insertar una anotación con claridad, pero el contenido y el orden se mantienen \
igual) -- inserta una anotación justo después de cada pasaje que trabaje de verdad un elemento de \
las listas de arriba, con el formato EXACTO [[código]] (doble corchete, así lo distingues de un \
enlace Markdown normal). Usa SOLO los códigos de las listas dadas -- no inventes ninguno fuera de \
ellas, si un código no existe se descartará al procesar tu respuesta. No hace falta anotar todos \
los elementos de las listas, solo los que el documento trabaje de verdad -- no fuerces relaciones \
que no existan. Un mismo pasaje puede llevar varias anotaciones seguidas si moviliza más de un \
elemento, p.ej. \"...miden la humedad del suelo [[2.3]][[B.4]]...\".
</tarea>

<formato_de_salida>
Devuelve ÚNICAMENTE el documento anotado en texto/Markdown plano, sin explicaciones antes ni \
después, sin envolverlo en bloques de código.
</formato_de_salida>"
    );

    Ok(json!({"prompt": prompt}))
}

pub fn validar_deteccion_curricular(conn: &Connection, body: Value) -> Result<Value, ApiError> {
    let course_id = req_str(&body, "course_id")?;
    let tipos = str_list(&body, "tipos");
    let respuesta = body.get("respuesta").and_then(Value::as_str).unwrap_or("");

    let mut codigo_a_elemento: HashMap<String, (String, String, String, String)> = HashMap::new();
    for tipo in &tipos {
        for (id, code, description) in elementos_por_tipo(conn, course_id, tipo)? {
            codigo_a_elemento.insert(code.clone(), (tipo.clone(), id, code, description));
        }
    }

    let mut elementos: BTreeMap<String, Vec<Value>> = tipos.iter().map(|t| (t.clone(), vec![])).collect();
    let mut ids_vistos: std::collections::HashSet<String> = std::collections::HashSet::new();
    let mut codigos_descartados: Vec<String> = vec![];

    let re = Regex::new(r"\[\[([^\[\]]+)\]\]").unwrap();
    for cap in re.captures_iter(respuesta) {
        let codigo = cap[1].trim();
        match codigo_a_elemento.get(codigo) {
            None => {
                if !codigos_descartados.iter().any(|c| c == codigo) {
                    codigos_descartados.push(codigo.to_string());
                }
            }
            Some((tipo, elem_id, code, description)) => {
                if ids_vistos.contains(elem_id) { continue; }
                ids_vistos.insert(elem_id.clone());
                if let Some(list) = elementos.get_mut(tipo) {
                    list.push(json!({"id": elem_id, "code": code, "description": description}));
                }
            }
        }
    }

    Ok(json!({
        "documentoAnotado": respuesta,
        "elementos": elementos,
        "codigosDescartados": codigos_descartados,
    }))
}

#[cfg(test)]
mod tests {
    use crate::db;
    use crate::routers::dispatch;
    use serde_json::json;

    fn seed_curso_con_curriculo(conn: &rusqlite::Connection) -> String {
        let course = dispatch(conn, "POST", "/courses", Some(json!({"level": "3 ESO", "subject": "Biología"}))).unwrap();
        let course_id = course["id"].as_str().unwrap().to_string();
        let sc = dispatch(conn, "POST", &format!("/courses/{course_id}/competences"), Some(json!({"code": "CE1", "description": "..."}))).unwrap();
        let sc_id = sc["id"].as_str().unwrap().to_string();
        dispatch(conn, "POST", &format!("/courses/{course_id}/criteria"), Some(json!({"competenceId": sc_id, "code": "1.1", "description": "Explica el ciclo del agua"}))).unwrap();
        dispatch(conn, "POST", &format!("/courses/{course_id}/basic-knowledge"), Some(json!({"code": "A.1", "description": "El ciclo del agua"}))).unwrap();
        course_id
    }

    #[test]
    fn generar_prompt_unidad_incluye_curriculo_real() {
        let conn = db::test_connection();
        let course_id = seed_curso_con_curriculo(&conn);

        let resultado = dispatch(&conn, "POST", "/prompts/unidad-programacion/generar", Some(json!({
            "course_id": course_id,
            "documento": "El agua cambia de estado según la temperatura.",
        }))).unwrap();

        let prompt = resultado["prompt"].as_str().unwrap();
        assert!(prompt.contains("Biología"));
        assert!(prompt.contains("3 ESO"));
        assert!(prompt.contains("A.1: El ciclo del agua"));
        assert!(prompt.contains("1.1: Explica el ciclo del agua"));
        assert_eq!(resultado["mapa"], json!({}));
    }

    #[test]
    fn generar_prompt_unidad_falla_sin_curriculo() {
        let conn = db::test_connection();
        let course = dispatch(&conn, "POST", "/courses", Some(json!({"level": "1 ESO", "subject": "Música"}))).unwrap();
        let course_id = course["id"].as_str().unwrap().to_string();

        let err = dispatch(&conn, "POST", "/prompts/unidad-programacion/generar", Some(json!({
            "course_id": course_id, "documento": "texto",
        }))).unwrap_err();
        assert_eq!(err.status, 400);
    }

    #[test]
    fn validar_unidad_mapea_codigos_reales_y_descarta_inventados() {
        let conn = db::test_connection();
        let course_id = seed_curso_con_curriculo(&conn);

        let respuesta = json!({
            "name": "El ciclo del agua",
            "context": "Una sequía en el pueblo",
            "sessions": 1,
            "sessionDetails": [{
                "titulo": "Sesión 1",
                "actividades": [{
                    "titulo": "Explicación",
                    "tipo": "Exposición/explicación docente",
                    "agrupamiento": "gran_grupo",
                    "duracionMin": 55,
                    "recursos": [],
                    "descripcion": "Se explica el ciclo del agua",
                    "linkedCriteriaIds": ["1.1", "9.9"],
                    "adaptacion": "",
                }],
            }],
            "finalProduct": {"incluido": false},
            "finalExam": {"incluido": false},
            "linkedBasicKnowledgeIds": ["A.1", "Z.9"],
            "linkedCriteriaIds": ["1.1"],
        }).to_string();

        let resultado = dispatch(&conn, "POST", "/prompts/unidad-programacion/validar", Some(json!({
            "course_id": course_id, "respuesta": respuesta,
        }))).unwrap();

        let unidad = &resultado["unidad"];
        assert_eq!(unidad["name"], "El ciclo del agua");
        assert_eq!(unidad["linkedBasicKnowledgeIds"].as_array().unwrap().len(), 1); // A.1 real, Z.9 descartado
        assert_eq!(unidad["linkedCriteriaIds"].as_array().unwrap().len(), 1);
        let actividad_criterios = unidad["sessionDetails"][0]["actividades"][0]["linkedCriteriaIds"].as_array().unwrap();
        assert_eq!(actividad_criterios.len(), 1); // 1.1 real, 9.9 descartado
        assert_eq!(unidad["linkedSpecificCompetenceIds"].as_array().unwrap().len(), 1);

        let descartados = resultado["codigosDescartados"].as_array().unwrap();
        assert!(descartados.iter().any(|v| v == "Z.9"));
        assert!(descartados.iter().any(|v| v == "9.9"));
    }

    // Simula lo que a veces pega el profesor: la respuesta envuelta en una
    // valla ```json ... ``` y un salto de línea real (no escapado) dentro
    // de una cadena -- el caso concreto que motivó reparar_control_chars_en_cadenas.
    #[test]
    fn validar_unidad_json_con_valla_markdown_y_salto_de_linea_sin_escapar() {
        let conn = db::test_connection();
        let course_id = seed_curso_con_curriculo(&conn);

        let respuesta = "Aquí tienes tu unidad:\n```json\n{\"name\": \"Unidad\ncon salto\", \"context\": \"c\", \"sessions\": 0, \"sessionDetails\": [], \"finalProduct\": {\"incluido\": false}, \"finalExam\": {\"incluido\": false}, \"linkedBasicKnowledgeIds\": [], \"linkedCriteriaIds\": []}\n```\n".to_string();

        let resultado = dispatch(&conn, "POST", "/prompts/unidad-programacion/validar", Some(json!({
            "course_id": course_id, "respuesta": respuesta,
        }))).unwrap();
        assert_eq!(resultado["unidad"]["name"], "Unidad\ncon salto");
        assert_eq!(resultado["unidad"]["context"], "c");
    }

    #[test]
    fn generar_prompt_instrumento_y_validar_round_trip() {
        let conn = db::test_connection();
        let course_id = seed_curso_con_curriculo(&conn);
        let criterios = dispatch(&conn, "GET", &format!("/courses/{course_id}/criteria"), None).unwrap();
        let criterion_id = criterios[0]["id"].as_str().unwrap().to_string();

        let generado = dispatch(&conn, "POST", "/prompts/instrumento-evaluacion/prompt", Some(json!({
            "course_id": course_id, "criterion_ids": [criterion_id], "tool_type": "rubric", "num_niveles": 3,
        }))).unwrap();
        let prompt = generado["prompt"].as_str().unwrap();
        assert!(prompt.contains("Rúbrica"));
        assert!(prompt.contains("1.1: Explica el ciclo del agua"));

        let respuesta = json!({
            "name": "Rúbrica del ciclo del agua",
            "levels": [{"name": "Bajo", "points": 1}, {"name": "Alto", "points": 3}],
            "items": [{
                "description": "Explica el ciclo",
                "weight": 1,
                "linkedCriteriaIds": ["1.1", "9.9"],
                "levelDescriptions": {"Bajo": "No lo explica", "Alto": "Lo explica con detalle", "Inexistente": "..."},
            }],
        }).to_string();

        let validado = dispatch(&conn, "POST", "/prompts/instrumento-evaluacion/validar", Some(json!({
            "course_id": course_id, "tool_type": "rubric", "respuesta": respuesta,
        }))).unwrap();

        let instrumento = &validado["instrumento"];
        assert_eq!(instrumento["type"], "rubric");
        assert_eq!(instrumento["levels"].as_array().unwrap().len(), 2);
        let item_criterios = instrumento["items"][0]["linkedCriteriaIds"].as_array().unwrap();
        assert_eq!(item_criterios.len(), 1); // 1.1 real, 9.9 descartado
        let level_descs = instrumento["items"][0]["levelDescriptions"].as_object().unwrap();
        assert_eq!(level_descs.len(), 2); // "Inexistente" descartado por no ser un nivel real
        assert_eq!(validado["codigosDescartados"].as_array().unwrap().len(), 1);
    }

    #[test]
    fn generar_prompt_instrumento_basa_en_contexto_cuando_se_da() {
        // La aportación inicial del profesor (p.ej. el enunciado de un
        // examen pegado en "¿Qué quieres evaluar?") llega como `contexto` --
        // sin la instrucción de basarse en ella, la IA podía tratarla como
        // decorativa y generar ítems genéricos a partir solo de la
        // descripción de cada criterio (confirmado como bug real 2026-09-04).
        let conn = db::test_connection();
        let course_id = seed_curso_con_curriculo(&conn);
        let criterios = dispatch(&conn, "GET", &format!("/courses/{course_id}/criteria"), None).unwrap();
        let criterion_id = criterios[0]["id"].as_str().unwrap().to_string();

        let generado = dispatch(&conn, "POST", "/prompts/instrumento-evaluacion/prompt", Some(json!({
            "course_id": course_id, "criterion_ids": [criterion_id], "tool_type": "rubric", "num_niveles": 3,
            "contexto": "Examen con las preguntas: 1) ¿Qué es el ciclo del agua? 2) Dibuja sus fases.",
        }))).unwrap();
        let prompt = generado["prompt"].as_str().unwrap();
        assert!(prompt.contains("Examen con las preguntas"));
        assert!(prompt.contains("Basa el instrumento en lo descrito arriba"));

        // Sin contexto ni documento_clase (solo criterios elegidos a mano),
        // no debe aparecer ninguna de las dos instrucciones de "basa el
        // instrumento en..." -- no hay nada real que citar.
        let generado_sin_contexto = dispatch(&conn, "POST", "/prompts/instrumento-evaluacion/prompt", Some(json!({
            "course_id": course_id, "criterion_ids": [criterion_id], "tool_type": "rubric", "num_niveles": 3,
        }))).unwrap();
        let prompt_sin_contexto = generado_sin_contexto["prompt"].as_str().unwrap();
        assert!(!prompt_sin_contexto.contains("Basa el instrumento en"));
    }

    #[test]
    fn generar_prompt_instrumento_sin_criterios_ni_contexto_falla() {
        let conn = db::test_connection();
        let course_id = seed_curso_con_curriculo(&conn);

        let err = dispatch(&conn, "POST", "/prompts/instrumento-evaluacion/prompt", Some(json!({
            "course_id": course_id, "criterion_ids": [], "tool_type": "checklist",
        }))).unwrap_err();
        assert_eq!(err.status, 400);
    }

    #[test]
    fn generar_prompt_adaptacion_material_incluye_material_y_notas() {
        let conn = db::test_connection();

        let resultado = dispatch(&conn, "POST", "/prompts/adaptacion-material/prompt", Some(json!({
            "material": "Explica el ciclo del agua en 5 pasos.",
            "notas_alumno": "Alumno: PERS_000001\nNecesidades NEAE: dislexia",
        }))).unwrap();

        let prompt = resultado["prompt"].as_str().unwrap();
        assert!(prompt.contains("Explica el ciclo del agua en 5 pasos."));
        assert!(prompt.contains("PERS_000001"));
        assert!(prompt.contains("dislexia"));
    }

    #[test]
    fn generar_prompt_deteccion_curricular_y_validar_round_trip() {
        let conn = db::test_connection();
        let course_id = seed_curso_con_curriculo(&conn);

        let resultado = dispatch(&conn, "POST", "/prompts/deteccion-curricular/prompt", Some(json!({
            "course_id": course_id,
            "documento": "El agua cambia de estado según la temperatura.",
            "tipos": ["criterios", "saberes"],
        }))).unwrap();
        let prompt = resultado["prompt"].as_str().unwrap();
        assert!(prompt.contains("1.1: Explica el ciclo del agua"));
        assert!(prompt.contains("A.1: El ciclo del agua"));

        let documento_anotado = "El agua cambia de estado [[1.1]][[A.1]] según la temperatura [[9.9]].";
        let validado = dispatch(&conn, "POST", "/prompts/deteccion-curricular/validar", Some(json!({
            "course_id": course_id,
            "tipos": ["criterios", "saberes"],
            "respuesta": documento_anotado,
        }))).unwrap();

        assert_eq!(validado["elementos"]["criterios"].as_array().unwrap().len(), 1);
        assert_eq!(validado["elementos"]["saberes"].as_array().unwrap().len(), 1);
        assert_eq!(validado["codigosDescartados"].as_array().unwrap(), &vec![json!("9.9")]);
    }

    #[test]
    fn generar_prompt_deteccion_curricular_sin_tipos_falla() {
        let conn = db::test_connection();
        let course_id = seed_curso_con_curriculo(&conn);

        let err = dispatch(&conn, "POST", "/prompts/deteccion-curricular/prompt", Some(json!({
            "course_id": course_id, "documento": "...", "tipos": [],
        }))).unwrap_err();
        assert_eq!(err.status, 400);
    }
}
