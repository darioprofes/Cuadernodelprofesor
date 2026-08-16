# Correo a GMKtec — solicitud de actualización de BIOS

**Para**: service@gmktec.com
**Asunto**: BIOS firmware request — K16 (Ryzen 7 7735HS) — UMA frame buffer setting not applied (stuck at 512MB regardless of BIOS configuration)

---

Hello,

I'm writing about a firmware issue on a GMKtec NucBox K16 (AMD Ryzen 7 7735HS /
Radeon 680M iGPU). I'd like to request the latest available BIOS for this model, and
I'm including diagnostic evidence in case it helps identify the problem.

**Serial number**: [rellenar desde la etiqueta inferior del equipo]
**Current BIOS version**: K16 V1.01 (dated 01/21/2026)
**OS used for diagnosis**: Ubuntu 26.04 LTS (Linux kernel 7.0.0-29-generic)

**Issue**: The BIOS exposes a UMA Frame Buffer Size setting (under Advanced → AMD
CBS → NBIO → GFX Configuration), which I've set to both 8GB and 16GB in separate
tests. In every case, the operating system reports only **512MB** of VRAM actually
allocated to the iGPU — the configured value is never applied.

This was verified with `dmesg` at boot:

```
amdgpu 0000:e5:00.0: VRAM: 512M 0x000000F400000000 - 0x000000F41FFFFFFF (512M used)
amdgpu 0000:e5:00.0: [drm] Detected VRAM RAM=512M, BAR=512M
```

**Tested combinations, all producing the same 512MB result**:
- UMA Frame Buffer Size = 16GB, UMA Mode = UMA_SPECIFIED
- UMA Frame Buffer Size = 8GB, UMA Mode = UMA_SPECIFIED
- BIOS reset to factory defaults
- Resizable BAR disabled
- Fast Boot disabled, with a full cold boot (power off, wait, power on — not a warm
  reboot) to rule out a cached POST skipping memory reinitialization

**Downstream effect**: because the iGPU has no real VRAM to work with, GPU compute
workloads (I'm running local LLM inference via llama.cpp/ROCm) end up sourcing memory
from system RAM through GTT, which triggers intermittent GPU page faults:

```
amdgpu 0000:e5:00.0: [gfxhub] page fault (src_id:0 ring:24 vmid:8 pasid:93)
amdgpu 0000:e5:00.0: GCVM_L2_PROTECTION_FAULT_STATUS:0x00801031
amdgpu 0000:e5:00.0:      Faulty UTCL2 client ID: TCP (0x8)
amdgpu 0000:e5:00.0:      PERMISSION_FAULTS: 0x3
amdgpu 0000:e5:00.0:      MAPPING_ERROR: 0x0
amdgpu 0000:e5:00.0:      WALKER_ERROR: 0x0
```

I've ruled out the OS/driver side of this. The same behavior appears with three
independent GPU backends on Linux (Vulkan via Mesa, ROCm via official Ollama
packages, and ROCm compiled natively for gfx1035), across multiple kernel/IOMMU
configurations — **and, most importantly, on Windows as well**, using the same
dual-boot installation on this machine. Both Windows Task Manager (Dedicated GPU
memory) and Ollama's own Vulkan backend on Windows report the same 512MB, despite the
BIOS being set to 8GB. Since Windows uses a completely separate, proprietary AMD
driver stack (WDDM) with no code in common with the Linux amdgpu/Mesa/ROCm stack,
this rules out a Linux-specific driver bug entirely. The only component common to
both operating systems reporting the same wrong value is the system firmware.

**Question**: Is there a BIOS version newer than V1.01 for the K16 that addresses UMA
frame buffer allocation? I noticed current product listings mention "an all new BIOS
update" adding three power modes (Quiet 28W / Balance 35W / Performance 40W) — if
that update is available, I don't believe I have it yet, since I don't see those
power profiles in my current BIOS.

Happy to provide any further logs or run additional tests if useful.

Thank you,
[tu nombre]
