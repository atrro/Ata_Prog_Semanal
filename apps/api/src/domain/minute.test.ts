import { test } from "node:test";
import assert from "node:assert/strict";
import { allowedFile, checklist, fileMatches, isReady, listInput, minuteInput, sendInput } from "./minute";

const valid = { parkId: "00000000-0000-4000-8000-000000000001", week: 44, date: "2026-10-29", territory: "Nordeste", dispatcher: "Ana Martins", participants: "Supervisor: Ricardo", checklist: [...checklist], sections: [{ title: "Programação", content: "<p>Revisão preventiva</p>" }], links: [] };
test("valida ata e exige os 13 itens para envio", () => { const data = minuteInput.parse(valid); assert.ok(isReady(data)); assert.equal(isReady({ ...data, checklist: checklist.slice(1) }), false); });
test("rejeita checklist duplicado e datas inválidas", () => { assert.equal(minuteInput.safeParse({ ...valid, checklist: [checklist[0], checklist[0]] }).success, false); assert.equal(minuteInput.safeParse({ ...valid, date: "2026-02-31" }).success, false); });
test("rejeita links executáveis e propriedades não autorizadas", () => { assert.equal(minuteInput.safeParse({ ...valid, companyId: "other" }).success, false); assert.equal(minuteInput.safeParse({ ...valid, links: [{ title: "Teste", url: "javascript:alert(1)" }] }).success, false); });
test("paginação é limitada e tem defaults", () => { assert.equal(listInput.safeParse({ limit: 1001 }).success, false); assert.deepEqual(listInput.parse({}), { page: 1, limit: 20 }); });
test("destinatários e versão são obrigatórios", () => { assert.equal(sendInput.safeParse({ recipients: [], version: 1 }).success, false); assert.equal(sendInput.safeParse({ recipients: ["email-invalido"], version: 1 }).success, false); });
test("anexos validam extensão e assinatura", () => { assert.equal(allowedFile("malware.exe"), false); assert.equal(fileMatches("arquivo.pdf", Buffer.from("<script>")), false); assert.equal(fileMatches("arquivo.pdf", Buffer.from("%PDF-1.7")), true); assert.equal(fileMatches("arquivo.csv", Buffer.from("nome,valor\nvento,10")), true); });
test("HTML vazio não libera envio", () => { assert.equal(isReady({ ...valid, sections: [{ title: "Vazio", content: "<p>&nbsp;</p>" }] }), false); });