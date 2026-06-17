# FALAI — Sistema Visual

## Conceito

Pill minimalista, flutuante no topo da tela. Visual escuro com glassmorphism sutil. Estados comunicam-se por cor, ícone e animação — sem texto longo. Settings window com navegação lateral limpa.

## Paleta

```css
:root {
  /* Superfície — escura, semi-opaca, suficiente pra ler com blur */
  --surface: rgba(20, 25, 35, 0.88);
  --surface-solid: #141923;

  /* Texto */
  --text-primary:   rgba(255, 255, 255, 0.93);
  --text-secondary: rgba(255, 255, 255, 0.72);
  --text-muted:     rgba(255, 255, 255, 0.52);

  /* Acento — roxo/indigo */
  --accent:        #7c5cff;
  --accent-bg:     rgba(124, 92, 255, 0.20);
  --accent-border: rgba(124, 92, 255, 0.40);
  --accent-text:   #cbb5ff;

  /* Borda */
  --border: rgba(255, 255, 255, 0.12);

  /* Estados */
  --state-listening:  #ff4757;
  --state-processing: #f59e0b;
  --state-typing:     #10e676;
  --state-error:      #c0392b;
  --state-idle:       #6b7280;
}
```

## Tipografia

- Fonte: `Inter, system-ui, sans-serif`
- Tamanhos:
  - label: 12px
  - status: 13px
  - timer: 14px (monospace)
- Peso: 500 para labels, 600 para status.

## Notch Pill

### Dimensões

| Estado | Largura | Altura | Raio |
|--------|---------|--------|------|
| Colapsado (idle) | 220px | 34px | 17px |
| Expandido | 320px | 34px | 17px |

### Posição

- Topo central, margem-top de 8px.
- `alwaysOnTop: true`, `skipTaskbar: true`, transparente, frameless.
- Click-through fora da área do pill.

### Estados Visuais

| Estado | Fundo | Borda | Glow |
|--------|-------|-------|------|
| IDLE | `--surface` | `--border` | nenhum |
| LISTENING | `rgba(255,71,87,0.15)` | `rgba(255,71,87,0.40)` | pulse vermelho suave |
| PROCESSING | `rgba(245,158,11,0.12)` | `rgba(245,158,11,0.35)` | spinner amarelo |
| TYPING | `rgba(16,230,118,0.12)` | `rgba(16,230,118,0.35)` | glow verde por 2s |
| ERROR | `rgba(192,57,43,0.18)` | `rgba(192,57,43,0.45)` | nenhum |

### Animações

- Transição de estado: 250ms ease.
- Pulse listening: animação CSS `pulse` com scale 1.0 → 1.04 a cada 1.2s.
- Spinner processing: SVG/CSS rotação contínua.
- Typing: breve scale-up + fade do ícone.

## Settings Window

- Frameless com titlebar customizada.
- Fundo: `--surface-solid` (#141923).
- Sidebar à esquerda com ícones + labels.
- Seções: Geral, Idioma, Modelo, Atalhos, Sobre.
- Inputs com borda `--border`, focus com anel `--accent`.
- Botões primários com `--accent`.

## Acessibilidade

- Contraste mínimo 4.5:1 em todos os textos.
- Foco visível em inputs e botões.
- Animações suaves; respeitar `prefers-reduced-motion`.
- Touch target mínimo 44px em botões.

## Ícones

- Fonte: 14px sistema (emoji/Segoe UI Emoji) para 🎙️, ⏳, ✓, ✗.
- Logo FALAI: monograma "F" em roxo `#7c5cff`.
