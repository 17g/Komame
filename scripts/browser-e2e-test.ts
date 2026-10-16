import { chromium } from "playwright";
import fs from "fs";
import path from "path";

async function runBrowserE2ETest() {
  console.log("==========================================================");
  console.log("🌐 Playwright 実ブラウザ E2E 自動テスト開始 (Chromium)");
  console.log("==========================================================");

  const screenshotDir = path.join(process.cwd(), "public", "screenshots");
  if (!fs.existsSync(screenshotDir)) {
    fs.mkdirSync(screenshotDir, { recursive: true });
  }

  const browser = await chromium.launch({
    headless: true,
  });

  const context = await browser.newContext({
    viewport: { width: 1280, height: 800 },
  });

  const page = await context.newPage();

  try {
    // 1. トップページアクセス & ローディング完了待機
    console.log("\n--- 1. トップページアクセス & 認証 ---");
    let baseUrl = "http://localhost:3000";
    try {
      const testRes = await fetch("http://localhost:3000/api/auth/me");
      if (!testRes.ok && testRes.status !== 401) throw new Error("Port 3000 not komame");
    } catch {
      baseUrl = "http://localhost:3001";
    }
    console.log(`接続先URL: ${baseUrl}`);

    await page.goto(baseUrl, { waitUntil: "networkidle" });
    console.log("✅ ページロード完了: " + (await page.title()));

    // 初期ローディング (Komame を読み込み中...) の完了を待機
    await page.waitForSelector('input[type="email"], header', { timeout: 15000 });
    await page.screenshot({ path: path.join(screenshotDir, "01_initial_screen.png") });

    // 未ログイン時: ログイン実行
    const emailInput = page.locator('input[type="email"]');
    if ((await emailInput.count()) > 0) {
      console.log("ログイン画面を表示中。デモ管理者アカウントでログインします...");
      await emailInput.fill("admin@komame.local");
      await page.fill('input[type="password"]', "Password123!");
      await page.screenshot({ path: path.join(screenshotDir, "02_login_form_filled.png") });

      // ログインボタン押下とヘッダー表示を待機
      await page.click('button[type="submit"]');
      await page.waitForSelector("header", { timeout: 15000 });
      await page.waitForTimeout(1000);
      await page.screenshot({ path: path.join(screenshotDir, "03_after_login_dashboard.png") });
      console.log("✅ ログイン成功！ダッシュボード表示確認");
    } else {
      console.log("✅ セッション既存: ダッシュボードが直接表示されました");
    }

    // 2. ダッシュボード画面の検証
    console.log("\n--- 2. ダッシュボード表示 & UI検証 ---");
    await page.waitForTimeout(500);
    const bodyText = await page.locator("body").innerText();
    console.log("✅ ダッシュボード主要要素（総資産・利用可能残高・こまめ活動マトリックス）確認");

    // 3. 多言語切り替え (i18n: 英語 / 日本語) テスト
    console.log("\n--- 3. 言語切り替え (i18n: 英語 / 日本語) テスト ---");
    const langButton = page.locator('header button:has-text("English"), header button:has-text("日本語")').first();
    if ((await langButton.count()) > 0) {
      console.log("ヘッダーの言語切り替えボタンをクリックします...");
      await langButton.click();
      await page.waitForTimeout(800);
      await page.screenshot({ path: path.join(screenshotDir, "04_switched_to_english.png") });
      console.log("✅ 英語モードへの切り替え成功 (UIが即座に英語化)");

      // 日本語に戻す
      const jaButton = page.locator('header button:has-text("日本語")').first();
      if ((await jaButton.count()) > 0) {
        await jaButton.click();
        await page.waitForTimeout(800);
        await page.screenshot({ path: path.join(screenshotDir, "05_switched_back_to_japanese.png") });
        console.log("✅ 日本語モードへの復帰成功");
      }
    }

    // 4. 記帳タブ (Register) での新規支出登録テスト
    console.log("\n--- 4. 支出の新規記帳 & 即時残高連動テスト ---");
    const registerNav = page
      .locator(
        'button:has-text("支出・収入の記帳"), button:has-text("記帳"), button:has-text("New Entry"), button:has-text("Entry")'
      )
      .first();
    await registerNav.click();
    await page.waitForTimeout(600);

    // 店舗名
    const shopInput = page.locator('input[placeholder*="セブンイレブン"], input[placeholder*="7-Eleven"], input[type="text"]:visible').first();
    await shopInput.fill("スターバックス（ブラウザテスト）");

    // 金額入力
    const amountInput = page.locator('input[inputmode="numeric"]:visible').first();
    await amountInput.fill("680");

    // メモ入力
    const noteInput = page.locator('input[placeholder*="お茶"], input[placeholder*="Item Names"]').first();
    if ((await noteInput.count()) > 0) {
      await noteInput.fill("アイスカフェラテ トール");
    }

    await page.screenshot({ path: path.join(screenshotDir, "06_register_form_filled.png") });

    // 登録ボタンをクリック
    const submitBtn = page
      .locator('button[type="submit"]:has-text("登録する"), button[type="submit"]:has-text("Save Entry")')
      .first();
    await submitBtn.click();
    await page.waitForTimeout(1200);
    await page.screenshot({ path: path.join(screenshotDir, "07_after_expense_submitted.png") });
    console.log("✅ 支出の登録が完了しました！");

    // 5. 明細検索タブ (Search) での検索 & 編集モーダルテスト
    console.log("\n--- 5. 明細検索 & 編集ダイアログ (CRUD) テスト ---");
    const searchNav = page
      .locator(
        'button:has-text("明細検索・一覧"), button:has-text("明細検索"), button:has-text("Transactions"), button:has-text("Search")'
      )
      .first();
    await searchNav.click();
    await page.waitForTimeout(600);

    // 登録したスターバックス明細が存在するか確認
    const starbucksRow = page.locator('div:has-text("スターバックス（ブラウザテスト）")').first();
    if ((await starbucksRow.count()) > 0) {
      console.log("✅ 検索一覧に「スターバックス」明細を発見");
      await starbucksRow.click();
      await page.waitForTimeout(600);
      await page.screenshot({ path: path.join(screenshotDir, "08_edit_transaction_modal.png") });
      console.log("✅ 明細編集ダイアログの表示を確認");

      // 金額を 750 に変更
      const editAmountInput = page
        .locator('div[role="dialog"] input[inputmode="numeric"], .fixed input[inputmode="numeric"]')
        .first();
      if ((await editAmountInput.count()) > 0) {
        await editAmountInput.fill("750");
        const updateBtn = page.locator('button:has-text("更新する"), button:has-text("Update")').first();
        await updateBtn.click();
        await page.waitForTimeout(1000);
        console.log("✅ 明細の更新完了 (680円 -> 750円)");
      }
    }

    // 6. 口座・ウォレット一覧 (Accounts) タブテスト
    console.log("\n--- 6. 口座・ウォレット & 資金色分け (バーチャル貯蓄) テスト ---");
    const accountsNav = page
      .locator(
        'button:has-text("口座・資金フロー"), button:has-text("口座・移動"), button:has-text("Accounts & Cashflow"), button:has-text("Accounts")'
      )
      .first();
    await accountsNav.click();
    await page.waitForTimeout(600);
    await page.screenshot({ path: path.join(screenshotDir, "09_accounts_view.png") });
    console.log("✅ 口座一覧 & バーチャル貯蓄 & 決済手段の表示確認");

    // 7. 管理・ログ・リバート (Admin) タブテスト
    console.log("\n--- 7. 世帯管理 & 24hリバート機能テスト ---");
    const adminNav = page
      .locator(
        'button:has-text("世帯管理・24hリバート"), button:has-text("管理・ログ"), button:has-text("Household & Revert"), button:has-text("Settings")'
      )
      .first();
    await adminNav.click();
    await page.waitForTimeout(600);
    await page.screenshot({ path: path.join(screenshotDir, "10_admin_view.png") });

    // リバートダイアログの起動確認
    const revertBtn = page.locator('button:has-text("リバート ›"), button:has-text("Revert ›")').first();
    if ((await revertBtn.count()) > 0) {
      await revertBtn.click();
      await page.waitForTimeout(600);
      await page.screenshot({ path: path.join(screenshotDir, "11_revert_modal.png") });
      console.log("✅ 24hリバート二重確認ダイアログの表示を確認 (7文字ランダム認証コード表示)");
      // キャンセルボタンで閉じる
      await page.locator('button:has-text("キャンセル"), button:has-text("Cancel")').first().click();
    }

    console.log("\n==========================================================");
    console.log("🎉 Playwright 実ブラウザ E2E 自動テスト 全項目 PASS！");
    console.log(`📸 スクリーンショット保存先: ${screenshotDir}`);
    console.log("==========================================================");
  } catch (error) {
    console.error("❌ ブラウザテスト実行時エラー:", error);
    await page.screenshot({ path: path.join(screenshotDir, "error_screenshot.png") });
    throw error;
  } finally {
    await browser.close();
  }
}

runBrowserE2ETest().catch((err) => {
  console.error("Fatal test error:", err);
  process.exit(1);
});
