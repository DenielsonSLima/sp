import { resourceError } from "../../cadastros/remote.js";
import { watchSetting } from "../realtime.js";
import { loadWatermarkSettings } from "../queries.js";
import { settings, saveWatermark } from "../state.js";
import { frame, field, feedback, escapeHtml, emptyLines } from "../common.js";
export async function render(root) {
  const route = location.hash;
  try {
    await loadWatermarkSettings();
    if (!root.isConnected || route !== location.hash) return;
  } catch (error) {
    resourceError(root, error);
    return;
  }
  const w = settings.watermark;
  root.innerHTML = frame(
    "marca-dagua",
    `<div class="settings-columns"><form class="card settings-form watermark-form"><h2>Personalizar marca d’água</h2><div class="settings-stack"><label>Tipo<select name="type"><option value="text">Texto</option><option value="image">Imagem local</option></select></label>${field("Texto da marca", "text", w.text)}<label>Imagem<input name="image" type="file" accept="image/png,image/jpeg,image/webp"></label><p class="settings-helper">PNG, JPEG ou WebP, até 2 MB.</p><label>Opacidade <output data-output="opacity"></output><input type="range" name="opacity" min="5" max="50" value="${w.opacity}"></label><label>Tamanho do texto <output data-output="size"></output><input type="range" name="size" min="18" max="56" value="${w.size}"></label><label>Rotação <output data-output="rotation"></output><input type="range" name="rotation" min="-45" max="45" value="${w.rotation}"></label></div><div class="settings-actions"><button type="submit" class="button primary">Salvar marca d’água</button></div></form><section class="card settings-preview"><h2>Prévia em tempo real</h2><div class="preview-paper watermark-paper">${emptyLines()}${emptyLines()}<div class="watermark-layer"></div></div></section></div>`,
  );
  let image = w.image || "";
  const form = root.querySelector("form");
  form.elements.type.value = w.type;
  const read = () => ({
    _version: w._version,
    ...Object.fromEntries(new FormData(form)),
    image,
    opacity: Number(form.elements.opacity.value),
    size: Number(form.elements.size.value),
    rotation: Number(form.elements.rotation.value),
  });
  const preview = () => {
    const w = read(),
      layer = root.querySelector(".watermark-layer");
    layer.replaceChildren();
    if (w.type === "image" && w.image) {
      const img = document.createElement("img");
      img.src = w.image;
      img.alt = "Marca d’água";
      layer.append(img);
    } else layer.textContent = w.type === "image" ? "Selecione uma imagem" : w.text;
    layer.style.opacity = w.opacity / 100;
    layer.style.fontSize = w.size + "px";
    layer.style.transform = `translate(-50%,-50%) rotate(${w.rotation}deg)`;
    for (const key of ["opacity", "size", "rotation"])
      root.querySelector(`[data-output="${key}"]`).textContent =
        w[key] + (key === "opacity" ? "%" : key === "rotation" ? "°" : " px");
  };
  form.onsubmit = async (e) => {
    e.preventDefault();
    const button = form.querySelector("[type=submit]");
    if (button.disabled) return;
    button.disabled = true;
    try {
      await saveWatermark(read());
      feedback(root, "Marca d’água salva.");
    } catch (error) {
      feedback(root, error.message);
    } finally {
      button.disabled = false;
    }
  };
  form.oninput = (e) => {
    if (e.target.type !== "file") preview();
  };
  form.elements.image.onchange = () => {
    const file = form.elements.image.files[0];
    if (!file) return;
    if (!["image/png", "image/jpeg", "image/webp"].includes(file.type) || file.size > 2 * 1024 * 1024) {
      feedback(root, "Escolha uma imagem PNG, JPEG ou WebP de até 2 MB.");
      form.elements.image.value = "";
      return;
    }
    const reader = new FileReader();
    reader.onload = () => {
      image = String(reader.result);
      form.elements.type.value = "image";
      preview();
      feedback(root, "Imagem carregada.");
    };
    reader.onerror = () => feedback(root, "Não foi possível ler a imagem.");
    reader.readAsDataURL(file);
  };
  preview();
  watchSetting(root, "watermarks", () => {
    feedback(
      root,
      "Há uma atualização no banco. Reabra esta configuração para carregar os dados mais recentes; seus campos foram preservados.",
    );
  });
}
