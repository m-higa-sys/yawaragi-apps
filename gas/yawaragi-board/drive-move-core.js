// gas/yawaragi-board/drive-move-core.js
// Drive移動エンドポイント moveDriveFile の純ロジック正本（I/Oなし）。
// node でテスト可能（scripts/test-drive-move.js）。GAS側 handleMoveDriveFile は
// この関数群と同じ判定をコード.js内に内包する（GASは単一ファイルのため）。
'use strict';

// 値が「実質的に空でない文字列」かを判定し、トリム文字列 or null を返す
function _str(v) {
  if (v === undefined || v === null) return null;
  var s = String(v).trim();
  return s.length ? s : null;
}

// パラメータ検証・正規化
// 戻り: { ok:true, value:{fileId,addParent,removeParent,newName} } | { ok:false, error }
function parseMoveParams(params) {
  if (!params || typeof params !== 'object') {
    return { ok: false, error: 'no_params' };
  }
  var fileId = _str(params.fileId);
  var addParent = _str(params.addParent);
  var removeParent = _str(params.removeParent);
  var newName = _str(params.newName);

  if (!fileId) return { ok: false, error: 'missing_param: fileId' };
  if (!addParent) return { ok: false, error: 'missing_param: addParent' };

  return {
    ok: true,
    value: {
      fileId: fileId,
      addParent: addParent,
      removeParent: removeParent, // null 可
      newName: newName,           // null 可
    },
  };
}

// 現状と要求から、必要な操作を導出（冪等判定の核）
// current: { parents:[String], name:String }
// req:     { addParent, removeParent(null可), newName(null可) }
// 戻り: { needAdd, needRemove, removeTargets:[String], needRename, alreadyThere }
function decideMoveActions(current, req) {
  var parents = (current && current.parents) ? current.parents.slice() : [];
  var name = current ? current.name : null;

  var needAdd = parents.indexOf(req.addParent) === -1;

  var removeTargets;
  if (req.removeParent) {
    // 指定された親が実際に所属している時だけ除去対象
    removeTargets = parents.indexOf(req.removeParent) !== -1 ? [req.removeParent] : [];
  } else {
    // 省略時: addParent 以外の現在の全親を除去対象（純粋移動）
    removeTargets = parents.filter(function (p) { return p !== req.addParent; });
  }
  var needRemove = removeTargets.length > 0;

  var needRename = !!req.newName && req.newName !== name;

  var alreadyThere = !needAdd && !needRemove && !needRename;

  return {
    needAdd: needAdd,
    needRemove: needRemove,
    removeTargets: removeTargets,
    needRename: needRename,
    alreadyThere: alreadyThere,
  };
}

// 処理後の実状態が要求を満たすかを検証
// after: { parents:[String], name:String }
// req:   { addParent, removeParent(null可), newName(null可) }
// 戻り: { ok, reasons:[String] }
function verifyMoveResult(after, req) {
  var parents = (after && after.parents) ? after.parents : [];
  var name = after ? after.name : null;
  var reasons = [];

  if (parents.indexOf(req.addParent) === -1) {
    reasons.push('addParent not in parents: ' + req.addParent);
  }
  if (req.removeParent && parents.indexOf(req.removeParent) !== -1) {
    reasons.push('removeParent still present: ' + req.removeParent);
  }
  if (req.newName && name !== req.newName) {
    reasons.push('name mismatch: expected ' + req.newName + ' got ' + name);
  }

  return { ok: reasons.length === 0, reasons: reasons };
}

// node からの利用（GASでは typeof module === 'undefined' で無視される）
if (typeof module !== 'undefined' && module.exports) {
  module.exports = { parseMoveParams: parseMoveParams, decideMoveActions: decideMoveActions, verifyMoveResult: verifyMoveResult };
}
