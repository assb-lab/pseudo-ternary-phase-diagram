# pseudo-ternary-phase-diagram

Materials Project (MP) の DFT 計算エネルギーから、任意の 3 化合物 (または単体) を頂点とする
**擬似三元相図** (例: Li2S–P2S5–LiCl) を描き、各組成で熱力学的に安定な相の組み合わせを可視化する静的 Web アプリです。
MP のウェブサイトの相図は元素を頂点とする三元系にしか対応していないため、化合物を頂点とする断面を描けるようにしました。
計算はすべてブラウザ内で行います。

## できること

- 3 つの端成分 (化学式) を指定し、それらを含む化学系全体の convex hull を MP の thermo データから構築
- 断面上の相領域を厳密な多角形として描画し、隣接する領域が同じ色にならないよう 4 色で塗り分け
  (色覚多様性を考慮し、2 色相 × 2 明度で全ペアの識別性を検証済み)
  - 断面外の相を含む平衡 (例: Li3P–S–LiCl 断面での LiP + P) は斜線と破線の境界で区別
- 10% ごとのグリッドと目盛り
- 安定相 (●) と、E_hull がしきい値以下の準安定相 (○) を断面上にプロット
- 図上のホバー / クリック、または mol 比の入力で、その組成の分解生成物・反応式・端成分からの反応エネルギーを表示
- mol 分率 (化学式単位) / 原子分率 の座標切り替え
- **反応ライン**: 始点 S と終点 E (図上クリックで相・頂点にスナップ、または一覧から選択) を結ぶ線上で、
  平衡相の組が変わる比率ごとに反応式 `(1−x) S + x E → 生成物` と反応エネルギー ΔE を表示し、ΔE–x のグラフを描画
- **安定として扱う E_hull**: スライダーで指定した E_hull 以下の準安定相を hull の 0.1 meV/atom 下に置き、
  安定相として相図・反応を計算 (準安定相の表示用スライダーとは別)
- SVG 保存
- 日本語 / English 切り替え、テーマ (自動 / ライト / ダーク)。いずれも localStorage に保存
- MP から直接取得 (ローカル起動時)、curl で取得した JSON の読み込み、同梱サンプル (Li-P-S-Cl)

## 使い方

開発環境は Node.js **26.13.0** / pnpm **12.16.1** です。
`package.json` の `devEngines` に両方のバージョンを固定しています。
Vite+ を利用する場合は `vp env install` でこの環境を準備できます。
それ以外の場合も Node.js 26.13.0 と pnpm 12.16.1 を用意してください。

```bash
pnpm install --frozen-lockfile
pnpm dev        # = vp dev
```

1. Materials Project の API key を画面の入力欄に貼り付けます。key はこのブラウザの **localStorage** にのみ保存されます (「削除」で消去)。
2. 端成分を 3 つ入力し (例: `Li2S`, `P2S5`, `LiCl`)、thermo type を選んで「MP から取得して計算」。
3. 図をホバーすると分解生成物を表示、クリックで固定します。

### MP API と CORS

MP API はブラウザからの直接通信 (CORS) を materialsproject.org にしか許可していません。
`vp dev` / `vp preview` では `/mp-api` を MP API へ中継するので、ローカル起動時は直接取得できます。
静的ホスティングで公開した場合は「curl コマンドで取得」に表示されるコマンドで JSON を保存し、「JSON を読み込む」で読み込んでください。

## 計算方法

1. 化学系とその全サブ系の thermo ドキュメントを取得し、MP の形成エネルギーを使用します
   (GGA/GGA+U/r2SCAN mixing では total energy が同一スケールにないため)。
   準安定相は MP の `energy_above_hull` を安定相の hull 上に載せ直して MP の相図と一致させます
   ([reaction-voltage-calculator](https://github.com/assb-lab/reaction-voltage-calculator) と同じ方法)。
2. 組成 x での hull 上の分解は線形計画法 (two-phase simplex) で求めます。
3. 断面の点を端成分の原子分率 w で表すと組成は w の一次式なので、ある点で得た平衡相の組 P について
   λ(w) = P⁺ F w ≥ 0 を満たす領域が凸多角形になります。三角形をこの半平面群でクリップして領域を厳密に求め、
   まだ覆われていない点から順に種を取り直して三角形全体を埋めます。
4. mol 分率への変換 m_i ∝ w_i / n_i は射影変換なので直線は直線のまま保たれ、多角形の頂点を変換するだけで描けます。

エネルギーは 0 K の DFT 値で、温度・エントロピー効果は含みません。

## 開発

```bash
pnpm test       # vp test run
pnpm lint       # vp lint
pnpm build      # tsc -b && vp build
```

| パス                        | 内容                                   |
| --------------------------- | -------------------------------------- |
| `src/core/hull.ts`          | 形成エネルギー・安定相・LP による分解  |
| `src/core/pseudoTernary.ts` | 断面の相領域 (多角形) の計算           |
| `src/core/reaction.ts`      | 指定組成の分解生成物・反応エネルギー   |
| `src/data/mp.ts`            | MP API 取得・JSON 読み込み             |
| `src/components/`           | 相図 (SVG) と表示部品                  |
| `src/sample/`               | 同梱サンプル (MP Cl-Li-P-S, CC BY 4.0) |

## ライセンス

コードは [MIT License](LICENSE) (© 2026 assb-lab)。同梱データ `src/sample/` は下記の CC BY 4.0 に従います。

## データ

Materials Project, licensed under [CC BY 4.0](https://creativecommons.org/licenses/by/4.0/).
A. Jain et al., "Commentary: The Materials Project", _APL Mater._ **1**, 011002 (2013).
