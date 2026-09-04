# -*- mode: python ; coding: utf-8 -*-

from PyInstaller.utils.hooks import collect_data_files, collect_dynamic_libs

# es_core_news_md (el modelo de spaCy, ver services/anonimizador.py) trae sus
# propios pesos/config como archivos de datos junto al paquete -- el análisis
# estático normal de PyInstaller no los detecta solo (no son imports, son
# datos que el paquete lee de su propia carpeta en tiempo de ejecución),
# confirmado en real con un build de prueba que arrancaba pero fallaba con
# "Can't find model". collect_data_files() es el equivalente de
# --collect-data en un .spec.
datas = [
    ('src/materias_oficiales.json', '.'),
    ('src/neae_terminos.json', '.'),
]
datas += collect_data_files('es_core_news_md')
# pypdfium2 (ver fotos_pdf.py) carga su librería nativa (pdfium.dll, dentro
# del paquete pypdfium2_raw) con ctypes en tiempo de ejecución, no con un
# import normal -- el análisis estático de PyInstaller no la detecta sola
# como sí hace con una extensión .pyd importada de verdad, hay que
# declararla a mano con collect_dynamic_libs(). version.json (en los dos
# paquetes) es el mismo caso que los datos de es_core_news_md: lo lee el
# propio paquete en tiempo de ejecución, no aparece en el análisis estático.
datas += collect_data_files('pypdfium2') + collect_data_files('pypdfium2_raw')
binaries = collect_dynamic_libs('pypdfium2_raw')

a = Analysis(
    ['src/main.py'],
    pathex=[],
    binaries=binaries,
    datas=datas,
    hiddenimports=[],
    hookspath=[],
    hooksconfig={},
    runtime_hooks=[],
    excludes=[],
    noarchive=False,
    optimize=0,
)
pyz = PYZ(a.pure)

exe = EXE(
    pyz,
    a.scripts,
    [],
    exclude_binaries=True,
    name='python-helper',
    debug=False,
    bootloader_ignore_signals=False,
    strip=False,
    upx=True,
    console=True,
    disable_windowed_traceback=False,
    argv_emulation=False,
    target_arch=None,
    codesign_identity=None,
    entitlements_file=None,
)
coll = COLLECT(
    exe,
    a.binaries,
    a.datas,
    strip=False,
    upx=True,
    upx_exclude=[],
    name='python-helper',
)
