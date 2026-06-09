# 歴史データベース

Person と Event を多対多で関連付け、検索条件に応じてタイムラインを再描画する React プロトタイプです。
Notion のデータベースビューのように、同じデータをタイムライン・カテゴリ・人物ビューで切り替えられます。

## 構成

- `src/models.ts`: Person、Event、PersonEvent、TimelineItem の型定義
- `src/data/ww1.ts`: 第一次世界大戦のサンプル人物・出来事・関連データ
- `src/data/ww1.ts`: 第一次世界大戦、ソクラテス周辺、単語カードのサンプルデータ
- `src/query.ts`: 多対多リレーションの解決、Range / Point 判定、検索フィルター
- `src/App.tsx`: フィルターUI、ビュー切替、タイムライン描画、編集パネル
- `src/styles.css`: レイアウトと可視化スタイル

## できること

- カテゴリや国・所属で絞り込み
- タイムラインビューで国別レーンと人物レイヤーを表示
- カテゴリビューで出来事を分類リスト表示
- 人物ビューで人物カードを一覧表示
- 全カードビューで出来事・人物・単語カードを一覧表示
- データベース全体からカードを横断検索
- 出来事・人物カードをクリックして右パネルで編集
- 単語カードをクリックして右パネルで編集
- 詳細文中の用語クリックで解説ポップや関連カードリンクを表示

## 実行

```bash
npm install
npm run dev
```

地図ビューでGoogleマップのピンを使うには、Google Maps JavaScript API のキーを `.env.local` に設定します。

```bash
VITE_GOOGLE_MAPS_API_KEY=ここにAPIキー
```

Netlifyでは、プロジェクト設定の Environment variables に同じ名前で追加します。

```text
VITE_GOOGLE_MAPS_API_KEY
```

すぐ手元で開きたい場合:

```bash
npm run open:local
```

## ローカル以外から見る

### 同じWi-Fi内で見る

```bash
npm run preview:host
```

表示された `Network` のURL、またはこのPCのIPアドレスを使ったURLを、同じWi-Fiにつながっている端末で開きます。

例:

```text
http://192.168.1.199:4173/
```

### インターネットに公開する

このアプリは静的サイトとして公開できます。まず公開用ファイルを作ります。

```bash
npm run export
```

手早く共有したい場合は、Netlify Drop で `publish` フォルダをアップロードします。
アップロードが終わると、Wi-Fiが違うスマホやPCから開けるURLが発行されます。

```text
https://app.netlify.com/drop
```

GitHub と連携して公開する場合は、ビルドコマンドに `npm run build`、公開フォルダに `dist` を指定します。

このリポジトリには Netlify 用の `netlify.toml` を入れてあるので、Netlify 連携時は基本設定を自動で読めます。

## GitHub + Netlify で自動反映する

GitHubにこのプロジェクトを置き、Netlifyでそのリポジトリを選ぶと、GitHubに変更を送るたびにWeb版が自動更新されます。

Netlifyの設定:

```text
Build command: npm run build
Publish directory: dist
```

この設定は `netlify.toml` に入っています。
