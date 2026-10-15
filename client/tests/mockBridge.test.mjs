import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import ts from "typescript";

test("the demo only presents implemented device types", async () => {
  const source = await readFile(new URL("../src/api/mockBridge.ts", import.meta.url), "utf8");
  const { outputText } = ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 },
  });
  const { createMockBridge } = await import(`data:text/javascript;base64,${Buffer.from(outputText).toString("base64")}`);
  const previousWindow = globalThis.window;
  globalThis.window = { setInterval: () => 0 };
  const bridge = createMockBridge();
  try {
    const home = await bridge.getHome();
    const supportedKinds = new Set(["light", "outlet", "fan", "blind", "lock", "thermostat", "sensor"]);
    for (const accessory of home.accessories) {
      assert.ok(supportedKinds.has(accessory.kind), `${accessory.name} is an unsupported demo placeholder`);
      assert.doesNotMatch(accessory.name, /homepod|apple tv|doorbell|camera|vacuum/i);
    }
    assert.ok(home.accessories.some(a => a.kind === "sensor"));
    const lights = home.accessories.filter(a => a.kind === "light");
    const group = lights.find(a => a.members);
    assert.ok(group);
    assert.ok(group.members.every(id => lights.some(light => light.id === id)));
  } finally {
    bridge.close();
    if (previousWindow === undefined) delete globalThis.window;
    else globalThis.window = previousWindow;
  }
});
