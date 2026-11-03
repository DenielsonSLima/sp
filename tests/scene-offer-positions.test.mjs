import test from 'node:test';
import assert from 'node:assert/strict';
import { scenes } from '../interno/encartes/scene-catalog.js';
import { sceneOfferPositions } from '../interno/encartes/gallery/offer-positions.js';
import { createSceneOfferElements } from '../interno/encartes/gallery/scene-offers.js';

test('every gallery scene has valid independent offer placements for its exact product count', () => {
  assert.equal(Object.keys(sceneOfferPositions).length, scenes.length);
  for (const scene of scenes) {
    const positions = sceneOfferPositions[scene.id];
    assert.equal(positions?.length, scene.products.length, scene.id);
    const elements = createSceneOfferElements({ width: 1080, height: 1920 },
      scene.products.map(product => ({ id: product.key, name: product.name })), positions);
    assert.equal(elements.filter(e => e.offerField === 'price').length, scene.products.length);
    for (const { name, badge } of positions) {
      assert(name.y + name.height <= badge.y || name.x + name.width <= badge.x ||
        name.x >= badge.x + badge.size || name.y >= badge.y + badge.size, scene.id);
    }
    for (const element of elements) {
      assert(element.x >= 0 && element.y >= 0 && element.x + element.width <= 1080.001 && element.y + element.height <= 1920.001, scene.id);
    }
  }
});
