pub mod shortcuts;
pub mod preferences;
pub mod evaluation_tools;
pub mod students;
pub mod courses;
pub mod key_competences;
pub mod specific_competences;
pub mod evaluation_criteria;
pub mod basic_knowledge;
pub mod programming_units;
pub mod academic_years;
pub mod classes;
pub mod enrollments;
pub mod categories;
pub mod assignments;
pub mod grades;

use serde_json::Value;

// "Read-merge-write": en vez de construir SQL dinámico según qué campos
// llegaron en el PATCH (lo que hace services/*.py con model_dump exclude_unset),
// se lee la fila actual como Value, se sobreescriben solo las claves
// presentes en el patch, y se vuelve a escribir la fila entera. Más simple
// en Rust que ensamblar SET clauses dinámicas con tipos heterogéneos, y
// mismo resultado observable para un proceso único de escritorio.
pub fn merge_object(current: &Value, patch: &Value) -> Value {
    let mut merged = current.clone();
    if let (Some(merged_obj), Some(patch_obj)) = (merged.as_object_mut(), patch.as_object()) {
        for (key, value) in patch_obj {
            merged_obj.insert(key.clone(), value.clone());
        }
    }
    merged
}
