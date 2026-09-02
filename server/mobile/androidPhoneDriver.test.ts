import assert from "node:assert/strict";
import test from "node:test";
import { androidUiNodes } from "./androidUi.ts";

test("androidUiNodes preserves selected and checked state used by filter verification", () => {
  const [selected, checked, idle] = androidUiNodes(`
    <hierarchy>
      <node text="最多点赞" class="android.widget.TextView" selected="true" checked="false" bounds="[10,20][110,80]" />
      <node text="一周内" class="android.widget.RadioButton" selected="false" checked="true" bounds="[10,100][110,160]" />
      <node text="未看过" class="android.widget.TextView" bounds="[10,180][110,240]" />
    </hierarchy>
  `);

  assert.equal(selected.selected, true);
  assert.equal(selected.checked, false);
  assert.equal(checked.selected, false);
  assert.equal(checked.checked, true);
  assert.equal(idle.selected, false);
  assert.equal(idle.checked, false);
});

test("androidUiNodes decodes numeric XML entities in captured note text", () => {
  const nodes = androidUiNodes('<node text="&#128218; 英文原著" content-desc="&#x1F4D6; 正文" class="android.widget.TextView" selected="false" checked="false" bounds="[0,0][10,10]" />');
  assert.equal(nodes[0]?.text, "📚 英文原著");
  assert.equal(nodes[0]?.desc, "📖 正文");
});
