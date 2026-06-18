# FALAI — Plano de Correção: Config & Settings

> **Problemas:** Settings não reabre, config não aplica em tempo real, tudo quebrado.

## Bug 1 — Settings window não reabre

### Causa Raiz
`ipc/window.ts` lida com `window-close` chamando `.hide()`, não `.close()`. A janela fica oculta mas viva. Quando `openSettings()` verifica `if (this.settingsWindow && !this.settingsWindow.isDestroyed())`, encontra a janela oculta e chama `.focus()` — que não mostra uma janela oculta. O `closed` event nunca dispara, então `this.settingsWindow` nunca é `null`.

### Correção
Mudar `.hide()` → `.close()` no `window-close` handler. A janela fecha de verdade, `closed` event dispara, `this.settingsWindow` volta pra `null`.

**Arquivo:** `src/main/ipc/window.ts:9`
```typescript
// Antes:
BrowserWindow.fromWebContents(event.sender)?.hide();
// Depois:
BrowserWindow.fromWebContents(event.sender)?.close();
```

## Bug 2 — Config não aplica mudanças visuais (notchPosition)

### Causa Raiz
`NotchPill.positionWindow()` só roda uma vez no `show()`. Não há listener pra `config.on('changed')`. Quando notchPosition muda no config, o notch continua na posição antiga.

### Correção
Adicionar listener no constructor do `NotchPill` que chama `positionWindow()` quando `notchPosition` mudar.

**Arquivo:** `src/main/notch-pill.ts`
```typescript
constructor(private config: ConfigManager) {
    this.registerIpc();
    this.config.on('changed', () => this.positionWindow());
}
```

## Bug 3 — Settings window com título errado

### Causa Raiz
O título da settings window está em português "Falai — Configurações". Não é um bug funcional mas é inconsistente.

### Correção
Manter como está — não crítico.

---

## Tasks de Implementação

### Task 1: Fix `window-close` handler

**Files:**
- Modify: `src/main/ipc/window.ts:8-10`

```typescript
// Substituir .hide() por .close()
ipcMain.on('window-close', (event) => {
    BrowserWindow.fromWebContents(event.sender)?.close();
});
```

**Verificar build:** `npm run build`

### Task 2: Adicionar config listener no NotchPill

**Files:**
- Modify: `src/main/notch-pill.ts:15-17`

```typescript
constructor(private config: ConfigManager) {
    this.registerIpc();
    // Reagir a mudanças de config em tempo real
    this.config.on('changed', (cfg: FalaiConfig) => this.onConfigChanged(cfg));
}
```

Adicionar método:
```typescript
private onConfigChanged(cfg: FalaiConfig): void {
    // Reposicionar notch se posição mudou
    if (cfg.notchPosition) {
        this.positionWindow();
    }
}
```

**Verificar build:** `npm run build`

### Task 3: Rebuild + release

```bash
npm run build && npm run dist:win
# Upload to GitHub
```
