export const ja = {
  "app.title": "擬似三元相図",
  "app.subtitle":
    "Materials Project の DFT エネルギーから、任意の 3 化合物を頂点とする断面の安定相を描きます",
  "app.footer":
    "データ: Materials Project (CC BY 4.0) — A. Jain et al., APL Mater. 1, 011002 (2013)。エネルギーは 0 K の DFT 計算値で、温度・エントロピー効果は含みません。",

  "settings.language": "言語",
  "settings.theme": "テーマ",
  "theme.auto": "自動",
  "theme.light": "ライト",
  "theme.dark": "ダーク",

  "ends.title": "端成分",
  "ends.top": "上 (A)",
  "ends.left": "左下 (B)",
  "ends.right": "右下 (C)",
  "ends.hint": "化合物でも単体でも可 (例: Li2S / P2S5 / LiCl、Li / P / S)。化学系: {chemsys}",
  "ends.fetch": "MP から取得して計算",
  "ends.useLoaded": "読み込み済みデータで計算",

  "key.title": "Materials Project API key",
  "key.placeholder": "API key を貼り付け",
  "key.show": "表示",
  "key.hide": "隠す",
  "key.stored": "key はこのブラウザの localStorage にのみ保存されます。",
  "key.get": "key の取得",
  "key.delete": "削除",
  "key.cors":
    "MP API はブラウザからの直接通信 (CORS) を許可していないため、公開サイトでは直接取得できない場合があります。その場合は下の curl コマンドで取得した JSON を読み込んでください。",

  "data.title": "データ",
  "data.none": "未読み込み",
  "data.summary": "{n} 件 · 元素 {elements}",
  "data.loadJson": "JSON を読み込む",
  "data.sample": "サンプル (Li-P-S-Cl)",
  "data.sampleSource": "サンプル: Materials Project Cl-Li-P-S (GGA_GGA+U_R2SCAN)",
  "data.curl": "curl コマンドで取得",
  "data.curlHint":
    "環境変数 MP_API_KEY に key を設定して実行し、保存された JSON を読み込みます。1 ファイルは最大 1000 件で、不足していれば読み込み時に必要なページのコマンドを表示します。",

  "busy.fetching": "Materials Project から取得中…",
  "busy.progress": "取得中… {n}{total} 件",

  "diagram.mol": "mol 分率",
  "diagram.atom": "原子分率",
  "diagram.basis": "座標",
  "diagram.metastable": "準安定相",
  "diagram.saveSvg": "SVG を保存",
  "diagram.ariaLabel": "{system} 擬似三元相図",
  "diagram.axisMol": "mol%",
  "diagram.axisAtom": "at.% (原子分率)",
  "legend.stable": "安定相",
  "legend.metastable": "準安定相",
  "legend.tie": "相領域 (4 色塗り分け: 隣接する領域は別の色)",
  "legend.offplane": "斜線: 断面外の相を含む平衡",
  "diagram.coverage":
    "注意: 検出した領域が三角形の {pct}% しか覆っていません (非常に細い領域を見落としている可能性があります)。",
  "diagram.hint": "図上をホバーで分解生成物を表示、クリックで固定。",
  "diagram.empty":
    "端成分を入力して「MP から取得して計算」を押すか、サンプルを読み込んでください。",

  "regions.title": "相領域 ({n})",
  "regions.phases": "平衡相",
  "regions.offplane": "* 断面外の相",

  "probe.title": "組成の分解生成物",
  "probe.pinned": " (固定中)",
  "probe.phase": "相",
  "probe.composition": "組成 (mol%): {mol} · 原子分率: {atom}",
  "probe.energy": "端成分からの反応エネルギー: {mev} meV/atom ({kj} kJ/mol)",
  "probe.unpin": "固定を解除",
  "probe.empty": "図上をホバー / クリック、または組成を入力してください。",
  "probe.show": "この組成を表示",

  "phases.title": "断面上の相 ({n})",
  "phases.phase": "相",
  "phases.unit": "E_hull は meV/atom (読み込んだデータでの値)。† は安定として扱っている相。",

  "line.mode": "反応ライン",
  "line.title": "反応ライン",
  "line.hintStart": "図上をクリックして始点 S を指定します (相・頂点の近くではスナップします)。",
  "line.hintEnd": "続けて終点 E をクリックしてください。",
  "line.start": "始点 S",
  "line.end": "終点 E",
  "line.choose": "選択…",
  "line.mixture": "混合物 ({comp} mol%)",
  "line.swap": "入れ替え",
  "line.clear": "クリア",
  "line.xMol": "x (E の mol 分率)",
  "line.xAtom": "x (E の原子分率)",
  "line.reaction": "反応式 (1−x) S + x E → 生成物",
  "line.min": "最小",
  "line.chartLabel": "混合比に対する反応エネルギー",
  "line.energyNote":
    "ΔE (meV/atom): 未反応の S と E の混合物に対する平衡状態のエネルギー差。負ほど反応が進みやすく、最小の比率 (強調行) が最も反応性の高い組成です。S・E が化合物ならそのエントリのエネルギー、混合物なら hull 上のエネルギーを基準にします。表の行は相の組み合わせが変わる比率です。",

  "stability.label": "安定として扱う",
  "stability.note":
    "E_hull がこの値以下の準安定相を hull のわずかに下 (0.1 meV/atom) に置き、安定相として相図を計算します。",
  "legend.promoted": "安定扱いの準安定相",

  "err.noThermoType": "読み込んだデータに thermo type {type} のエントリがありません",
  "err.noEntries": "エントリが 1 件も返りませんでした",
  "err.jsonEmpty": "JSON にエントリがありません",
  "err.jsonFailed": "JSON の読み込みに失敗しました: {msg}",

  "formula.empty": "化学式が空です",
  "formula.unparsable": "化学式を解釈できません: {formula} ({pos} 文字目)",
  "formula.number": "数字の位置が不正です: {formula}",
  "formula.brackets": "括弧が対応していません: {formula}",
  "formula.emptyGroup": "空の括弧があります: {formula}",
  "formula.noElements": "元素がありません: {formula}",

  "hull.missingRefs": "単体のエントリがありません: {elements}",
  "section.needThree": "端成分は 3 つ必要です",
  "section.collinear": "3 つの端成分が一直線上にあります (組成が独立ではありません)",

  "mp.noKey": "API key を入力してください",
  "mp.network":
    "MP API に接続できませんでした。MP API はブラウザからの直接通信 (CORS) を許可していないため、`vp dev` / `vp preview` で起動するか、curl コマンドで取得した JSON を読み込んでください。",
  "mp.http": "MP API エラー: HTTP {status}{hint}",
  "mp.httpKeyHint": " (API key を確認してください)",
  "mp.noData": "MP API の応答に data がありません",
  "mp.incomplete":
    "JSON のエントリが不足しています ({loaded} / {total} 件)。_page=1〜{pages} の {pages} ファイルをすべて取得し、まとめて選択してください。",
  "mp.noDataArray": "JSON に data 配列がありません",
  "mp.badDoc": "thermo ドキュメントの形式ではありません",
};

export type MessageKey = keyof typeof ja;
