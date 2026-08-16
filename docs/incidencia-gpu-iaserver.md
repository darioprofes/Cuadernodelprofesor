# Informe de incidencia — fallos de GPU en el servidor de IA

**Fecha**: 15 de agosto de 2026
**Equipo**: GMKtec NucBox K16 · AMD Ryzen 7 7735HS · Radeon 680M (gfx1035) · 30 GB RAM
**Sistema**: Ubuntu 26.04 LTS, kernel 7.0.0-29-generic, BIOS K16 V1.01 (21/01/2026)
**Estado**: **mitigado, no resuelto**. `amd_iommu=off iommu=off` reduce mucho la
frecuencia del fallo pero no lo elimina — sigue siendo probabilístico. La solución de
fondo sigue dependiendo del firmware (§7 y §10).

---

## 1. Resumen

La GPU integrada falla de forma **intermitente** al ejecutar modelos de lenguaje: el
proceso aborta con `ROCm error: an illegal memory access was encountered`. El kernel
registra simultáneamente un fallo de página del driver `amdgpu`.

La causa está identificada: **el firmware entrega únicamente 512 MB de VRAM real**, sea
cual sea el valor configurado en la BIOS. En consecuencia, los pesos del modelo residen
en **GTT** (memoria del sistema prestada a la GPU), y los accesos de la GPU a esas
páginas del host son los que fallan.

No se ha encontrado ninguna solución desde el software. La inferencia en CPU es estable
y cubre la necesidad, con una penalización de tiempo asumible.

## 2. Síntoma

Al procesar peticiones con prompts de cierto tamaño (≈1.500 tokens en adelante), el
servidor de inferencia muere sin respuesta:

```
/…/ggml/src/ggml-cuda/ggml-cuda.cu:106: ROCm error
E ROCm error: an illegal memory access was encountered
```

Es **intermitente**: la misma configuración, con la misma petición repetida, completó
5 de 5 intentos en una prueba y abortó al primer intento minutos después. Esta
irreproducibilidad es lo que más ha dificultado el diagnóstico, e invalidó
comparativas de calidad entre modelos realizadas antes de identificarla (respuestas
vacías que se atribuyeron al modelo podían ser caídas de la GPU).

## 3. Evidencia

### 3.1 Fallo de página del kernel

```
amdgpu 0000:e5:00.0: [gfxhub] page fault (src_id:0 ring:24 vmid:8 pasid:93)
amdgpu 0000:e5:00.0:  Process llama-server pid 17254
amdgpu 0000:e5:00.0:   in page starting at address 0x00007752a9a17000 from client 0x1b (UTCL2)
amdgpu 0000:e5:00.0: GCVM_L2_PROTECTION_FAULT_STATUS:0x00801031
amdgpu 0000:e5:00.0:      Faulty UTCL2 client ID: TCP (0x8)
amdgpu 0000:e5:00.0:      MORE_FAULTS: 0x1
amdgpu 0000:e5:00.0:      WALKER_ERROR: 0x0
amdgpu 0000:e5:00.0:      PERMISSION_FAULTS: 0x3
amdgpu 0000:e5:00.0:      MAPPING_ERROR: 0x0
amdgpu 0000:e5:00.0:      RW: 0x0
```

Lectura de los campos:

| Campo | Valor | Significado |
|---|---|---|
| `MAPPING_ERROR` | 0x0 | La página **sí** está mapeada |
| `WALKER_ERROR` | 0x0 | El recorrido de tablas de páginas fue correcto |
| `PERMISSION_FAULTS` | 0x3 | El acceso se denegó **por permisos** |
| `RW` | 0x0 | Era una **lectura** |
| Cliente | TCP (caché de textura) | Un kernel de cómputo leyendo datos |
| Dirección | `0x00007752…` | Rango de memoria de **usuario** (host), no VRAM |

**Conclusión**: no es un acceso fuera de rango de la aplicación —eso produciría
`MAPPING_ERROR` o fallo del walker—. Es una denegación de permisos al leer memoria
del host, es decir un problema de la capa de traducción de direcciones.

### 3.2 VRAM real disponible

```
amdgpu 0000:e5:00.0: VRAM: 512M 0x000000F400000000 - 0x000000F41FFFFFFF (512M used)
amdgpu 0000:e5:00.0: [drm] Detected VRAM RAM=512M, BAR=512M
```

Este valor **no cambia** con la configuración de la BIOS. Comprobado con:

- `UMA Mode = UMA_SPECIFIED`, `UMA Frame Buffer Size = 16 GB`
- `UMA Frame Buffer Size = 8 GB`
- Restauración de valores por defecto de la BIOS
- `Resizable BAR` desactivado
- `Fast Boot` desactivado, con apagado completo y arranque en frío

En los seis casos: `Detected VRAM RAM=512M`.

### 3.3 Confusión a evitar

ROCm informa de una cifra muy distinta:

```
ggml_cuda_init: found 1 ROCm devices (Total VRAM: 24576 MiB)
Device 0: AMD Radeon 680M, gfx1035 (0x1035), VRAM: 24576 MiB
```

Esos 24576 MiB **no son VRAM**: coinciden exactamente con el GTT
(`ttm.pages_limit`). Antes de ampliar ese tope, ROCm informaba de 15404 MiB, que era
el GTT de entonces. La cifra sigue al GTT, nunca a la BIOS. Esta discrepancia entre
capas ha generado la falsa impresión, en varias ocasiones, de que la reserva de la
BIOS estaba funcionando.

## 3.4 Confirmación cruzada: también falla en Windows (prueba decisiva)

Este equipo tiene arranque dual con Windows. Comprobado en Windows con dos métodos
independientes:

- **Administrador de tareas → Rendimiento → GPU → Memoria de GPU dedicada**: 512 MB
- **Ollama (backend Vulkan) → `server.log`**: mismo valor

Windows usa un driver de AMD completamente propio (WDDM), sin ninguna relación de
código con la pila de Linux (`amdgpu`/Mesa/ROCm). Que **dos sistemas operativos con
pilas de controladores totalmente independientes** reporten el mismo valor erróneo
descarta por completo un bug de driver específico de Linux. El único componente común
a ambos, anterior a que cualquiera de los dos arranque, es **el firmware de la
placa**. Esta es la prueba más sólida de toda la investigación y confirma sin
ambigüedad que la causa está en la BIOS, no en el sistema operativo.

## 3.5 Matiz importante: Windows no se cae con el mismo firmware roto

Con Ollama expuesto en red en la instalación Windows de este mismo equipo (IP
192.168.10.116 — nótese que difiere de la IP de Linux, 192.168.10.118), se lanzaron
generaciones reales contra `gemma4:E4B` reportado por Ollama como `100% GPU`.

**Resultado: 100% de éxito, sin ningún fallo, en el mismo hardware con el mismo
firmware roto (512 MB de VRAM dedicada confirmados también en Windows, §3.4).**

Además, se repitió en Windows **la prueba exacta que fallaba en Linux**: mismo
documento (`atmosfera.txt`), mismo troceado por fragmentos de 6 diapositivas, misma
petición de bloques temáticos en JSON, repetida en tandas. **9 de 9 peticiones
correctas** (23-43 s cada una, sin ningún error) — la misma prueba que en Linux caía
de forma intermitente ya en el primer o segundo intento.

Rendimiento (no directamente comparable en modelo/cuantización con las pruebas de
Linux, pero orientativo):

| | Generación | Procesado de prompt |
|---|---|---|
| Windows, Ollama, gemma4:E4B | 11,28 tok/s | 77,34 tok/s |

**Esto obliga a separar dos hallazgos que se venían tratando como uno solo:**

1. **El firmware entrega mal la VRAM** (512 MB en vez de los 8 GB configurados) —
   confirmado idéntico en Linux y Windows (§3.4). Esto es, sin duda, un problema de la
   BIOS.
2. **La inestabilidad bajo carga de cómputo** (los `illegal memory access` / page
   faults de §3.1-§3.2) — **solo observada en Linux**. Windows, operando sobre el
   mismo reparto de memoria roto, no se ha caído en ninguna prueba.

Es decir: el firmware está mal en los dos sistemas por igual, pero **parte de la
inestabilidad tiene un componente específico de la pila `amdgpu`/IOMMU de Linux** que
el driver WDDM de Windows no comparte, aunque ambos arrastren la misma causa de fondo.
Windows convive con la limitación sin desplomarse; Linux no, incluso con las
mitigaciones aplicadas (§10).

**Implicación práctica**: si se necesita GPU con fiabilidad antes de que llegue una
BIOS corregida, ejecutar la inferencia desde la instalación Windows de este mismo
equipo (vía Ollama, con `OLLAMA_HOST=0.0.0.0:11434` y la regla de firewall
correspondiente) es una alternativa más estable que cualquier configuración probada
en Linux, aunque con el mismo techo de rendimiento modesto por la limitación de
memoria de fondo.

## 4. Causa raíz

1. El firmware asigna 512 MB de VRAM real, ignorando la configuración de UMA.
2. Los modelos (4,6 GB el más pequeño en uso) no caben, así que `cudaMalloc` los
   sirve desde **GTT** = páginas de RAM del sistema mapeadas para la GPU.
3. Los accesos de los kernels de cómputo a esas páginas producen fallos de permisos
   intermitentes.

El fallo es por tanto **inherente al camino de memoria que esta máquina obliga a usar**,
no a una configuración incorrecta del software de inferencia.

## 5. Hipótesis descartadas

| Hipótesis | Cómo se descartó |
|---|---|
| Backend concreto (Vulkan) | Falla igual |
| ROCm empaquetado de Ollama | Falla igual (verificado con anterioridad por el usuario) |
| Compilación propia para gfx1035 (TheRock) | Falla igual — **tres pilas de espacio de usuario independientes fallan del mismo modo** |
| `HSA_OVERRIDE_GFX_VERSION` (hacer pasar la GPU por gfx1030) | Innecesario y sin efecto: rendimiento idéntico con y sin |
| Tamaño de lote | Falla con `-b` 512, 256 y 128 |
| Context checkpoints | Falla igual con `--ctx-checkpoints 0` |
| Memoria gestionada (`cudaMallocManaged`) | Desactivada: solo se activa con `GGML_CUDA_ENABLE_UNIFIED_MEMORY`, que no está definida |
| Bandera `GGML_HIP_UMA=ON` del script de compilación | **Bandera muerta**: no existe en el llama.cpp actual, no tenía ningún efecto |
| Dos servidores compitiendo por la GPU | Falla también con la GPU oculta al segundo proceso (`HIP_VISIBLE_DEVICES=""`) |
| Configuración de BIOS (UMA, ReBAR, Fast Boot) | Sin efecto sobre `Detected VRAM` en ninguna combinación |
| Falta de permisos sobre `/dev/kfd` | Era un problema **real y distinto**, ya resuelto (grupos `render`/`video`); no explica estos fallos |
| `HSA_ENABLE_SDMA=0` (desactivar copias asíncronas de ROCm) | 0/8 intentos correctos, falla al primero |
| `amdgpu.vm_update_mode=3` (tablas de páginas actualizadas por CPU en vez de por el motor de la GPU) | 0/8 intentos correctos, falla al primero. Era la hipótesis mejor fundamentada: sin *large BAR*, el driver usa por defecto el modo 0 (actualización asíncrona desde la GPU), candidato natural a carreras con la invalidación del TLB |
| `ROCR_VISIBLE_DEVICES=0` | Inaplicable: `rocminfo` lista dos agentes (CPU + GPU) porque HSA siempre enumera la CPU, pero **solo hay un agente GPU** y llama.cpp ya lo selecciona correctamente (`ROCm0`) |

### Mitigación parcial encontrada

`iommu=pt` en la línea de kernel **reduce** la frecuencia del fallo (5/5 intentos
correctos en prueba aislada, frente a caídas al primer intento sin él), pero no lo
elimina: con el pipeline completo vuelve a aparecer. Es coherente con el diagnóstico
—el IOMMU está implicado— pero insuficiente.

## 6. Impacto

**Ninguno sobre la funcionalidad.** La inferencia en CPU es estable: el pipeline
completo de generación de material didáctico se ejecutó de principio a fin sin un solo
fallo, en 10,4 minutos.

El coste es de tiempo. Medido sobre Llama-3.2-3B Q4_K_M:

| | CPU | GPU (cuando no falla) |
|---|---|---|
| Generación | 13,0 t/s | 19,1 t/s |
| Procesado de prompt | 312 t/s | 435 t/s |

Para una tarea que se lanza puntualmente y se ejecuta en segundo plano con indicador
de progreso, la diferencia no es determinante. **La GPU es una optimización, no un
requisito.**

## 7. Acciones pendientes

Por orden de relación con la causa raíz:

1. **Comprobar desde Windows** (instalado en el mismo equipo) si la Radeon 680M declara
   la memoria dedicada configurada en la BIOS. Discrimina entre "el firmware no la
   entrega a nadie" y "el driver de Linux no la recoge". *Coste: 5 minutos.*
2. **Solicitar actualización de BIOS a GMKtec** (`service@gmktec.com`, con número de
   serie). No hay descarga pública para el K16; se entrega bajo petición. Es la capa
   que demostradamente falla.
3. **Probar el kernel `7.0.0-14-generic`** (versión original de Ubuntu 26.04, aún
   disponible en el repositorio) por si se trata de una regresión posterior. Nota: el
   paquete `linux-modules-extra-7.0.0-14-generic` no existe; `amdgpu` se distribuye en
   `linux-modules`, así que bastan `linux-image-7.0.0-14-generic` y
   `linux-modules-7.0.0-14-generic`.
4. **`amd_iommu=off iommu=off`** — ataca directamente el mecanismo del fallo. Implica
   perder el aislamiento de DMA; aceptable en un equipo dedicado sin virtualización ni
   passthrough, y reversible en un reinicio.
5. **Reducir el GTT a 8 GB** (`ttm.pages_limit=2097152 ttm.page_pool_size=2097152
   amdgpu.gttsize=8192`) para acercarse a una configuración menos exótica.

> Cambiar **una sola variable por prueba**: la naturaleza intermitente del fallo hace
> que dos cambios simultáneos impidan atribuir el resultado.

## 8. Anexo — comandos de verificación

```bash
# VRAM real entregada por el firmware
sudo dmesg | grep "Detected VRAM"

# Fallos de página de la GPU
sudo dmesg | grep -iE "amdgpu|page fault|VM_L2"

# Lo que ve el kernel frente a lo que informa ROCm
cat /sys/class/drm/card1/device/mem_info_vram_total   # VRAM real
cat /sys/class/drm/card1/device/mem_info_gtt_total    # GTT

# Uso en vivo durante una generación
watch -n1 'cat /sys/class/drm/card1/device/mem_info_vram_used \
           /sys/class/drm/card1/device/mem_info_gtt_used'
```

## 10. Actualización — `amd_iommu=off iommu=off` (mitigación, no solución)

Probado tras descartar `HSA_ENABLE_SDMA=0` y `amdgpu.vm_update_mode=3` (sin efecto
ninguno de los dos, 0/8 intentos correctos en ambos casos).

Con `GRUB_CMDLINE_LINUX_DEFAULT` llevando `amd_iommu=off iommu=off` (sin `iommu=pt`,
que queda superado):

| Prueba | Resultado |
|---|---|
| 8 peticiones seguidas, un servidor | 8/8 |
| Pipeline completo (generador GPU + embeddings CPU) | 4/4 |
| Pipeline completo, repetición inmediata | **falló en la primera petición** |
| 5 arranques limpios, un servidor | 5/5 |

**Lectura**: mejora sustancial respecto a `iommu=pt` (que ya fallaba en la segunda
prueba con carga real) pero **el fallo sigue siendo probabilístico**, no se ha
eliminado. Es coherente con la causa raíz (§4): mientras el modelo siga residiendo en
GTT en vez de en VRAM real, el camino de acceso a páginas del host —origen del
`PERMISSION_FAULTS`— sigue existiendo; `iommu=off` lo hace más tolerante, no lo cierra.

Se descartó además una hipótesis intermedia: que el fallo apareciera solo con dos
procesos `llama-server` simultáneos viendo la misma GPU. Ocultarla al proceso de
embeddings (`HIP_VISIBLE_DEVICES="" ROCR_VISIBLE_DEVICES="" GGML_VK_VISIBLE_DEVICES=""`)
dio 4/4 en una ejecución y falló en la siguiente con la configuración idéntica — el
mismo patrón intermitente, no una causa distinta.

**Decisión final**: se prefirió no mantener `amd_iommu=off` de forma permanente por su
coste de seguridad (pérdida de aislamiento DMA), dado que el beneficio ya no es
crítico — el trabajo real se hace en CPU. Se fijó **`iommu=pt`** como término medio.

**`iommu=pt` NO es suficiente por sí solo.** Se probó explícitamente si al menos un
único servidor, sin ningún proceso concurrente tocando ROCm, era estable bajo
`iommu=pt` — la hipótesis de que la concurrencia entre dos `llama-server` (visto en
§10, apartado anterior) fuera la causa real. **Resultado: falló en el primer intento
de 10, un solo servidor, sin concurrencia.** Esto descarta la concurrencia como causa
principal: la variable que de verdad determina la estabilidad es el nivel de IOMMU
(`off` >> `pt` > por defecto), no cuántos procesos hay activos.

**Conclusión operativa**: con `iommu=pt` (configuración final en producción), la GPU
no es fiable para ningún paso del pipeline, ni siquiera aislado. Si en el futuro se
necesita la GPU con cierta fiabilidad antes de que llegue una solución de firmware, la
única configuración que dio resultados consistentes en las pruebas de hoy fue
`amd_iommu=off iommu=off` con un único servidor activo (13/13 en las pruebas
aisladas) — a sabiendas del coste de seguridad que implica. Con `iommu=pt`, la
inferencia en CPU es la única vía recomendada.

## 9. Nota sobre un fallo distinto, ya resuelto

Durante el diagnóstico apareció y se resolvió otro problema, sin relación con este
pero fácil de confundir: **activar `GGML_CUDA_ENABLE_UNIFIED_MEMORY` permite cargar
modelos que no caben en memoria, pero produce salida corrupta sin ningún aviso** (se
observaron 12.000 tokens de `z=z=z=zz=…`). `llama-bench` no lo detecta porque solo
mide velocidad, nunca valida el contenido. **Toda configuración nueva debe validarse
generando texto real.** La comprobación en el código es de *presencia* de la variable,
no de su valor: definirla a `0` la activa igualmente.
