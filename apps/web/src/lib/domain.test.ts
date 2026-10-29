import { test } from "node:test";
import assert from "node:assert/strict";
import { canSend, checklistLabels, minuteSchema, minutesSeed, nextVersion, safeUrl } from "./domain";

test("envio exige checklist completo, participantes e conteúdo", () => {
  assert.equal(canSend(minutesSeed[0]), false);
  assert.equal(canSend({ ...minutesSeed[0], checklist: checklistLabels }), true);
  assert.equal(canSend({ ...minutesSeed[0], checklist: checklistLabels, sections: [] }), false);
});
test("versionamento preserva auditoria anterior", () => {
  const original = minutesSeed[0];
  const updated = nextVersion(original, "Ana Martins", "Ata editada");
  assert.equal(updated.version, original.version + 1);
  assert.equal(updated.audit.length, original.audit.length + 1);
  assert.equal(original.audit.length, 1);
});
test("links rejeitam protocolos executáveis", () => {
  assert.equal(safeUrl("javascript:alert(1)"), null);
  assert.equal(safeUrl("data:text/html,test"), null);
  assert.equal(safeUrl("https://teams.microsoft.com"), "https://teams.microsoft.com/");
});
test("campos obrigatórios e semana são validados", () => {
  assert.equal(minuteSchema.safeParse({ ...minutesSeed[0], week: 54 }).success, false);
  assert.equal(minuteSchema.safeParse(minutesSeed[0]).success, true);
});