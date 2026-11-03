import { renderDesign } from '../renderer.js';
import { createRulers } from './rulers.js';
import { createGuides } from './guides.js';
export function createCanvasRenderer({ root, state: S, getInteraction, isActive, message }) {
  let paintToken = 0,
    drawFrame = null,
    rulers = null,
    rulerStage = null,
    guides = null,
    showCenter = true,
    onGuideChange = () => {};
  const draw = async () => {
    const canvas = root.querySelector('.flyer-canvas'),
      stage = root.querySelector('.flyer-stage'),
      board = root.querySelector('.flyer-artboard');
    if (!canvas || !root.isConnected || !isActive()) return;
    const d = { ...S.design, elements: S.design.elements.map((element) => ({ ...element })) },
      token = ++paintToken;
    const availableWidth = Math.max(200, stage.clientWidth - 48),
      availableHeight = Math.max(260, stage.clientHeight - 48);
    const scale =
      S.zoom === 'fit' ? Math.min(availableWidth / d.width, availableHeight / d.height, 1) : Number(S.zoom) / 100;
    board.style.width = `${Math.round(d.width * scale)}px`;
    board.style.height = `${Math.round(d.height * scale)}px`;
    if (rulerStage !== stage) {
      rulers?.destroy();
      guides?.destroy();
      rulerStage = stage;
      rulers = createRulers(stage);
      guides = createGuides(stage, {
        onChange: (next) => {
          showCenter = next.showCenter;
          if (JSON.stringify(next.guides) !== JSON.stringify(S.design.guides || { x: [], y: [] }))
            onGuideChange(next.guides);
        },
      });
    }
    rulers.update({ width: d.width, height: d.height, scale, board });
    guides.update({ width: d.width, height: d.height, scale, board, guides: d.guides || { x: [], y: [] }, showCenter });
    const interaction = getInteraction();
    interaction?.sync(d, S.selection, scale);
    try {
      const scratch = document.createElement('canvas');
      await renderDesign(scratch, d, { scale: Math.min(1, 1400 / Math.max(d.width, d.height)) });
      if (token !== paintToken || !root.isConnected || !isActive() || !canvas.isConnected) return;
      canvas.width = scratch.width;
      canvas.height = scratch.height;
      canvas.getContext('2d').drawImage(scratch, 0, 0);
    } catch (error) {
      if (token === paintToken && canvas.isConnected)
        message('Não foi possível renderizar a arte: ' + error.message, true);
    }
  };
  const requestDraw = () => {
    if (!drawFrame)
      drawFrame = requestAnimationFrame(() => {
        drawFrame = null;
        draw();
      });
  };
  const cancel = () => {
    paintToken++;
    rulers?.destroy();
    guides?.destroy();
    guides = null;
    rulers = rulerStage = null;
    if (drawFrame) cancelAnimationFrame(drawFrame);
    drawFrame = null;
  };
  return {
    draw,
    requestDraw,
    cancel,
    getGuidePositions: () => guides?.getGuidePositions() || { x: [], y: [] },
    showSnaps: (lines) => guides?.setSnapLines(lines),
    clearGuides: () => guides?.clear(),
    isCenterVisible: () => showCenter,
    setCenterVisible: (visible) => {
      showCenter = visible;
      guides?.setCenterVisible(visible);
    },
    onGuideChange: (callback) => {
      onGuideChange = callback;
    },
  };
}
