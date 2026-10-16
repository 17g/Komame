"use client";

import React, { useState, useMemo } from "react";
import { SavingsGoalItem, TransactionItem, AccountItem, CategoryItem } from "@/types";
import { formatCurrency, formatDate } from "@/lib/utils";
import {
  Target,
  Sprout,
  Sparkles,
  Award,
  Plus,
  Flame,
  CheckCircle2,
  Calendar,
  X,
  TrendingUp,
  Leaf,
  ShieldCheck,
} from "lucide-react";

interface GoalsTabProps {
  goals: SavingsGoalItem[];
  transactions?: TransactionItem[];
  accounts?: AccountItem[];
  categories?: CategoryItem[];
  onTriggerToast: (msg: string) => void;
  onRefreshGoals?: () => void;
}

export function GoalsTab({
  goals,
  transactions = [],
  accounts = [],
  categories = [],
  onTriggerToast,
  onRefreshGoals,
}: GoalsTabProps) {
  // 新規目標追加モーダルの状態
  const [showModal, setShowModal] = useState(false);
  const [newTitle, setNewTitle] = useState("");
  const [newTargetAmount, setNewTargetAmount] = useState("");
  const [newTargetDate, setNewTargetDate] = useState("");
  const [selectedAccountIds, setSelectedAccountIds] = useState<string[]>([]);
  const [selectedColor, setSelectedColor] = useState("#2E7D32");
  const [isSubmitting, setIsSubmitting] = useState(false);

  // 1. こまめ活動（ストリーク & 記帳実績）の動的集計
  const {
    streakDays,
    thisMonthTxCount,
    distinctDaysThisMonth,
    txCountByDate,
  } = useMemo(() => {
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const formatDateStr = (d: Date) => {
      const yyyy = d.getFullYear();
      const mm = String(d.getMonth() + 1).padStart(2, "0");
      const dd = String(d.getDate()).padStart(2, "0");
      return `${yyyy}-${mm}-${dd}`;
    };

    const todayStr = formatDateStr(today);
    const currentYear = today.getFullYear();
    const currentMonth = today.getMonth() + 1;
    const currentMonthPrefix = `${currentYear}-${String(currentMonth).padStart(2, "0")}`;

    // 日付ごとの明細件数マップ
    const counts: Record<string, number> = {};
    let monthTxCount = 0;
    const monthDaysSet = new Set<string>();

    (transactions || []).forEach((t) => {
      const d = t.date ? t.date.split("T")[0] : t.createdAt ? t.createdAt.split("T")[0] : null;
      if (d) {
        counts[d] = (counts[d] || 0) + 1;
        if (d.startsWith(currentMonthPrefix)) {
          monthTxCount += 1;
          monthDaysSet.add(d);
        }
      }
    });

    // 連続記録ストリーク計算（今日記録があれば今日から、なければ昨日から遡って連続記録日数をカウント）
    const hasTodayTx = (counts[todayStr] || 0) > 0;
    let streak = 0;
    const checkDate = new Date(today);
    if (!hasTodayTx) {
      checkDate.setDate(checkDate.getDate() - 1);
    }
    while (true) {
      const checkStr = formatDateStr(checkDate);
      if ((counts[checkStr] || 0) > 0) {
        streak++;
        checkDate.setDate(checkDate.getDate() - 1);
      } else {
        break;
      }
    }

    return {
      streakDays: streak,
      thisMonthTxCount: monthTxCount,
      distinctDaysThisMonth: monthDaysSet.size,
      txCountByDate: counts,
    };
  }, [transactions]);

  // 2. 貯蓄目標の総合進捗集計
  const { totalTargetAmount, totalCurrentAmount, overallProgressRate } = useMemo(() => {
    if (!goals || goals.length === 0) {
      return { totalTargetAmount: 0, totalCurrentAmount: 0, overallProgressRate: 0 };
    }
    const totalTarget = goals.reduce((sum, g) => sum + (g.targetAmount || 0), 0);
    const totalCurrent = goals.reduce((sum, g) => sum + (g.currentAmount || 0), 0);
    const rate = totalTarget > 0 ? Math.min(100, Math.round((totalCurrent / totalTarget) * 100)) : 0;
    return {
      totalTargetAmount: totalTarget,
      totalCurrentAmount: totalCurrent,
      overallProgressRate: rate,
    };
  }, [goals]);

  // 3. まめの樹育成システム：ステージ動的遷移（種 / 双葉 / 新芽 / 実り）
  const sproutStage = useMemo(() => {
    // 判定基準: 貯蓄目標達成率、または継続ストリーク日数
    // ステージ4: 達成率80%以上 または ストリーク14日以上
    // ステージ3: 達成率50%以上 または ストリーク7日以上
    // ステージ2: 達成率25%以上 または ストリーク3日以上
    // ステージ1: 初期（種）
    if (overallProgressRate >= 80 || streakDays >= 14) {
      return {
        level: 4,
        icon: "🌳",
        title: "豊かな実り",
        stageName: "ステージ 4「豊かな実り」",
        badgeColor: "bg-emerald-500/10 text-emerald-700 border-emerald-300 dark:text-emerald-400",
        description:
          "枝いっぱいにまめの実がつきました！日々のこまめな積み重ねが、確かな安心と資産の大樹へと成長しています🌳✨",
        nextGoalHint: "最高ステージ到達！この豊かな実りを大切に維持していきましょう🎉",
        progressPct: 100,
      };
    } else if (overallProgressRate >= 50 || streakDays >= 7) {
      const nextRate = Math.max(0, 80 - overallProgressRate);
      const nextStreak = Math.max(0, 14 - streakDays);
      return {
        level: 3,
        icon: "🌿",
        title: "すくすく新芽",
        stageName: "ステージ 3「すくすく新芽」",
        badgeColor: "bg-primary-light text-primary border-primary-border",
        description:
          "茎が力強く伸び、葉が生き生きと茂ってきました！目標の半分を捉える素晴らしいペースで前進しています。",
        nextGoalHint: `次の「豊かな実り」まで: あと ${nextRate}% 達成 または ${nextStreak}日 連続記録`,
        progressPct: Math.round(((overallProgressRate - 50) / 30) * 100),
      };
    } else if (overallProgressRate >= 25 || streakDays >= 3) {
      const nextRate = Math.max(0, 50 - overallProgressRate);
      const nextStreak = Math.max(0, 7 - streakDays);
      return {
        level: 2,
        icon: "🌱",
        title: "かわいい双葉",
        stageName: "ステージ 2「かわいい双葉」",
        badgeColor: "bg-amber-500/10 text-amber-700 border-amber-300 dark:text-amber-400",
        description:
          "小さな双葉がひょっこり顔を出しました！日々のこまめな記録が、未来の資産の芽吹きとなって現れています。",
        nextGoalHint: `次の「すくすく新芽」まで: あと ${nextRate}% 達成 または ${nextStreak}日 連続記録`,
        progressPct: Math.round(((overallProgressRate - 25) / 25) * 100),
      };
    } else {
      const nextRate = Math.max(0, 25 - overallProgressRate);
      const nextStreak = Math.max(0, 3 - streakDays);
      return {
        level: 1,
        icon: "🌰",
        title: "はじまりの種",
        stageName: "ステージ 1「はじまりの種」",
        badgeColor: "bg-stone-500/10 text-stone-700 border-stone-300 dark:text-stone-400",
        description:
          "家計簿の第一歩を踏み出しました！こまめな記録で土をしっかり耕し、まめの芽吹きの準備を整えましょう。",
        nextGoalHint: `次の「かわいい双葉」まで: あと ${nextRate}% 達成 または ${nextStreak}日 連続記録`,
        progressPct: Math.round((overallProgressRate / 25) * 100),
      };
    }
  }, [overallProgressRate, streakDays]);

  // 4. 今月の収支・前月比節約額・やさしいアドバイスの動的生成
  const smartAdvices = useMemo(() => {
    const today = new Date();
    const currentYear = today.getFullYear();
    const currentMonth = today.getMonth() + 1; // 1-12
    const prevYear = currentMonth === 1 ? currentYear - 1 : currentYear;
    const prevMonth = currentMonth === 1 ? 12 : currentMonth - 1;

    const currentMonthPrefix = `${currentYear}-${String(currentMonth).padStart(2, "0")}`;
    const prevMonthPrefix = `${prevYear}-${String(prevMonth).padStart(2, "0")}`;

    // 今月と先月の明細抽出
    const curExpenses = transactions.filter(
      (t) => t.type === "expense" && (t.date || "").startsWith(currentMonthPrefix)
    );
    const prevExpenses = transactions.filter(
      (t) => t.type === "expense" && (t.date || "").startsWith(prevMonthPrefix)
    );
    const curIncomes = transactions.filter(
      (t) => t.type === "income" && (t.date || "").startsWith(currentMonthPrefix)
    );

    const curExpenseTotal = curExpenses.reduce((sum, t) => sum + t.amount, 0);
    const prevExpenseTotal = prevExpenses.reduce((sum, t) => sum + t.amount, 0);
    const curIncomeTotal = curIncomes.reduce((sum, t) => sum + t.amount, 0);
    const curNetBalance = curIncomeTotal - curExpenseTotal;

    // 費目別の支出比較
    const curByCat: Record<string, number> = {};
    const prevByCat: Record<string, number> = {};

    curExpenses.forEach((t) => {
      const name = t.categoryName || "その他";
      curByCat[name] = (curByCat[name] || 0) + t.amount;
    });
    prevExpenses.forEach((t) => {
      const name = t.categoryName || "その他";
      prevByCat[name] = (prevByCat[name] || 0) + t.amount;
    });

    // 先月比で最も節約できている費目の特定
    let bestSavedCategory = "";
    let bestSavedAmount = 0;

    Object.keys(prevByCat).forEach((catName) => {
      const prevAmt = prevByCat[catName] || 0;
      const curAmt = curByCat[catName] || 0;
      const saved = prevAmt - curAmt;
      if (saved > bestSavedAmount) {
        bestSavedAmount = saved;
        bestSavedCategory = catName;
      }
    });

    const adviceList: { icon: string; title: string; content: string; highlight?: string }[] = [];

    // ① 費目別・月間収支のアドバイス
    if (bestSavedCategory && bestSavedAmount > 0) {
      adviceList.push({
        icon: "💡",
        title: "費目の節約グッドニュース！",
        content: `今月は「${bestSavedCategory}」が先月比で`,
        highlight: `${formatCurrency(bestSavedAmount)} 節約`,
      });
    } else if (curIncomeTotal > 0 && curNetBalance > 0) {
      adviceList.push({
        icon: "💰",
        title: "今月の黒字キープ！",
        content: "今月の家計収支は現在",
        highlight: `+${formatCurrency(curNetBalance)} の黒字`,
      });
    } else if (prevExpenseTotal > 0 && curExpenseTotal < prevExpenseTotal) {
      const savedTotal = prevExpenseTotal - curExpenseTotal;
      adviceList.push({
        icon: "✨",
        title: "先月より支出セーブ中！",
        content: "全体の支出額が先月比で",
        highlight: `${formatCurrency(savedTotal)} 抑えられています`,
      });
    } else {
      adviceList.push({
        icon: "🌱",
        title: "こまめな記録が最大の資産！",
        content: "日々の支出を見える化できていることが安心への一番の近道です。焦らずマイペースに記録を重ねていきましょう。",
      });
    }

    // ② 目標達成ペース・見通しアドバイス
    if (goals.length > 0) {
      const mainGoal = goals[0];
      const targetAmount = mainGoal.targetAmount;
      const currentAmount = mainGoal.currentAmount || 0;
      const remainingAmount = Math.max(0, targetAmount - currentAmount);

      if (remainingAmount === 0 || (mainGoal.progressRate || 0) >= 100) {
        adviceList.push({
          icon: "🎉",
          title: "目標達成おめでとうございます！",
          content: `「${mainGoal.title}」の目標金額（${formatCurrency(targetAmount)}）を見事に達成しました！次のステップに向けて、新しい目標も設定してみましょう。`,
        });
      } else {
        const rate = mainGoal.progressRate || Math.round((currentAmount / targetAmount) * 100);
        if (rate >= 70) {
          adviceList.push({
            icon: "🎯",
            title: "ゴールまであと一歩！",
            content: `「${mainGoal.title}」の達成率が ${rate}% に到達！残り ${formatCurrency(
              remainingAmount
            )} です。このままのペースでゴールを掴み取りましょう🌱`,
          });
        } else {
          adviceList.push({
            icon: "📈",
            title: "着実にゴールへ前進中！",
            content: `「${mainGoal.title}」は現在 ${formatCurrency(currentAmount)}（達成率 ${rate}%）まで積み上がっています。毎月の一歩が確実な未来を作っています。`,
          });
        }
      }
    }

    // ③ ストリーク・継続の応援
    if (streakDays >= 7) {
      adviceList.push({
        icon: "🔥",
        title: "驚異のストリーク継続！",
        content: `${streakDays}日連続で記帳が続いています！完全に家計管理が生活の味方になっていますね。`,
      });
    } else if (streakDays >= 3) {
      adviceList.push({
        icon: "🌿",
        title: "三日坊主を乗り越え中！",
        content: `${streakDays}日連続で記録ができています！この調子で今週の完走を目指しましょう。`,
      });
    }

    return adviceList;
  }, [transactions, goals, streakDays]);

  // 新規目標の作成処理
  const handleCreateGoal = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newTitle.trim()) {
      onTriggerToast("目標タイトルを入力してください");
      return;
    }
    const amt = parseInt(newTargetAmount.replace(/,/g, ""), 10);
    if (isNaN(amt) || amt <= 0) {
      onTriggerToast("有効な目標金額を入力してください");
      return;
    }

    setIsSubmitting(true);
    try {
      const res = await fetch("/api/goals", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: newTitle.trim(),
          targetAmount: amt,
          targetDate: newTargetDate || null,
          accountIds: selectedAccountIds,
          color: selectedColor,
        }),
      });

      if (res.ok) {
        onTriggerToast("新しい貯蓄目標を作成しました！🌱");
        setShowModal(false);
        setNewTitle("");
        setNewTargetAmount("");
        setNewTargetDate("");
        setSelectedAccountIds([]);
        if (onRefreshGoals) {
          onRefreshGoals();
        }
      } else {
        const data = await res.json();
        onTriggerToast(data.error || "目標の作成に失敗しました");
      }
    } catch {
      onTriggerToast("通信エラーが発生しました");
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleToggleAccount = (accId: string) => {
    setSelectedAccountIds((prev) =>
      prev.includes(accId) ? prev.filter((id) => id !== accId) : [...prev, accId]
    );
  };

  // カラープリセット
  const colorPresets = ["#2E7D32", "#E6A15C", "#2563EB", "#9333EA", "#0D9488", "#DC2626"];

  return (
    <div className="flex flex-col gap-5 pb-24">
      {/* 1. まめの樹 育成システム (要件16-2: 実データ動的連動) */}
      <div className="p-5 bg-gradient-to-br from-app-surface via-app-surface to-primary-light/30 border border-primary-border rounded-2xl shadow-sm flex flex-col gap-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-xl bg-primary-light flex items-center justify-center text-primary">
              <Sprout className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-xs font-bold text-content-main">まめの樹 育成システム</h3>
              <p className="text-[11px] text-content-muted">こまめな記録と貯蓄で育つ私たちの樹</p>
            </div>
          </div>
          <div className="flex items-center gap-1.5">
            {streakDays > 0 && (
              <span className="flex items-center gap-1 text-[11px] font-bold text-amber-600 bg-amber-500/10 border border-amber-300 px-2 py-0.5 rounded-full">
                <Flame className="w-3.5 h-3.5 text-amber-500 fill-amber-500" />
                <span>{streakDays}日連続記録</span>
              </span>
            )}
            <span
              className={`text-[11px] font-extrabold px-2.5 py-0.5 rounded-full border ${sproutStage.badgeColor}`}
            >
              {sproutStage.stageName}
            </span>
          </div>
        </div>

        {/* 育成キャラクターメイン表示 */}
        <div className="flex items-center gap-4 bg-app-surface/80 p-3.5 rounded-xl border border-border">
          <div className="w-16 h-16 rounded-2xl bg-primary-light/80 border border-primary-border flex items-center justify-center text-3xl shadow-sm shrink-0 animate-bounce duration-1000">
            {sproutStage.icon}
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex items-center justify-between mb-1">
              <span className="text-xs font-extrabold text-content-main">
                こまめちゃん: {sproutStage.title}
              </span>
              <span className="text-[10px] font-bold text-content-muted">
                総合達成率 {overallProgressRate}%
              </span>
            </div>
            <p className="text-[11px] text-content-muted leading-relaxed">
              {sproutStage.description}
            </p>
          </div>
        </div>

        {/* 4ステージのステップインジケーター */}
        <div className="grid grid-cols-4 gap-2 pt-1">
          {[
            { lvl: 1, name: "種", icon: "🌰" },
            { lvl: 2, name: "双葉", icon: "🌱" },
            { lvl: 3, name: "新芽", icon: "🌿" },
            { lvl: 4, name: "実り", icon: "🌳" },
          ].map((st) => {
            const isPassed = sproutStage.level >= st.lvl;
            const isCurrent = sproutStage.level === st.lvl;
            return (
              <div
                key={st.lvl}
                className={`p-2 rounded-xl border text-center transition-all ${
                  isCurrent
                    ? "bg-primary-light/70 border-primary text-primary font-bold shadow-xs scale-102"
                    : isPassed
                    ? "bg-app-subtle border-border text-content-main opacity-80"
                    : "bg-app-subtle/40 border-border/60 text-content-muted/50"
                }`}
              >
                <div className="text-lg">{st.icon}</div>
                <div className="text-[10px] mt-0.5">{st.name}</div>
              </div>
            );
          })}
        </div>

        {/* 次のステージへの条件 */}
        <div className="flex items-center justify-between text-[11px] text-content-muted bg-app-subtle px-3 py-2 rounded-xl border border-border">
          <span className="font-medium">🌱 {sproutStage.nextGoalHint}</span>
          <span className="font-bold text-primary">今月 {distinctDaysThisMonth}日記録</span>
        </div>
      </div>

      {/* 2. 温かいスマート・アドバイス (要件16-3: 実データ動的連動) */}
      <div className="p-5 bg-app-surface border border-border rounded-2xl shadow-sm flex flex-col gap-3">
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 rounded-xl bg-accent-light flex items-center justify-center text-accent">
            <Sparkles className="w-4 h-4" />
          </div>
          <div>
            <h3 className="text-xs font-bold text-content-main">こまめからのやさしいアドバイス</h3>
            <p className="text-[11px] text-content-muted">収支と目標ペースに合わせた前向きなメッセージ</p>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-3 mt-1">
          {smartAdvices.map((adv, idx) => (
            <div
              key={idx}
              className="p-3.5 bg-app-subtle rounded-xl border border-border flex items-start gap-3"
            >
              <span className="text-lg shrink-0 mt-0.5">{adv.icon}</span>
              <div className="text-xs leading-relaxed text-content-main">
                <span className="font-bold text-content-main block mb-0.5">{adv.title}</span>
                <p className="text-content-muted">
                  {adv.content}
                  {adv.highlight && (
                    <strong className="text-primary font-bold ml-1">{adv.highlight}</strong>
                  )}
                  {adv.highlight ? "！" : ""}
                </p>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* 3. 貯蓄目標カード一覧 (要件17-2) */}
      <div className="p-5 bg-app-surface border border-border rounded-2xl shadow-sm flex flex-col gap-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-xl bg-primary-light flex items-center justify-center text-primary">
              <Target className="w-4 h-4" />
            </div>
            <div>
              <h3 className="text-xs font-bold text-content-main">貯蓄目標の進捗一覧</h3>
              <p className="text-[11px] text-content-muted">合算口座残高から自動集計</p>
            </div>
          </div>
          <button
            onClick={() => setShowModal(true)}
            className="flex items-center gap-1 px-3 py-1.5 bg-primary text-white rounded-xl text-xs font-bold shadow-xs hover:bg-primary-hover active:scale-95 transition-all"
          >
            <Plus className="w-3.5 h-3.5" />
            <span>目標を追加</span>
          </button>
        </div>

        {/* 目標サマリーバナー */}
        {goals.length > 0 && (
          <div className="flex items-center justify-between p-3.5 bg-app-subtle rounded-xl border border-border text-xs">
            <div>
              <span className="text-content-muted block text-[10px] font-bold">全目標の合算進捗</span>
              <span className="text-content-main font-bold font-display text-sm">
                {formatCurrency(totalCurrentAmount)} / {formatCurrency(totalTargetAmount)}
              </span>
            </div>
            <div className="text-right">
              <span className="text-content-muted block text-[10px] font-bold">全体達成率</span>
              <span className="text-primary font-extrabold text-sm">{overallProgressRate}%</span>
            </div>
          </div>
        )}

        {/* 各目標カード */}
        {goals.length === 0 ? (
          <div className="p-8 text-center bg-app-subtle rounded-xl border border-dashed border-border flex flex-col items-center gap-2">
            <span className="text-3xl">🌱</span>
            <p className="text-xs font-bold text-content-main">まだ貯蓄目標が登録されていません</p>
            <p className="text-[11px] text-content-muted max-w-sm">
              「年間100万円貯蓄」や「旅行積立」など、叶えたい目標を登録すると自動で進捗を集計します。
            </p>
            <button
              onClick={() => setShowModal(true)}
              className="mt-2 px-4 py-2 bg-primary text-white text-xs font-bold rounded-xl shadow-xs hover:bg-primary-hover transition-all"
            >
              最初の目標を作成する
            </button>
          </div>
        ) : (
          goals.map((g) => {
            const current = g.currentAmount ?? 0;
            const target = g.targetAmount;
            const progress = g.progressRate ?? (target > 0 ? Math.min(100, Math.round((current / target) * 100)) : 0);
            const isCompleted = progress >= 100 || g.isCompleted;
            const remaining = Math.max(0, target - current);

            // 目標に紐づく口座名リスト
            const targetAccounts = accounts.filter((a) =>
              (g.accountIdsJson as string[] | undefined)?.includes(a.id)
            );

            return (
              <div
                key={g.id}
                className="p-4 bg-app-subtle rounded-xl border border-border flex flex-col gap-3 relative overflow-hidden"
              >
                {/* 達成時のデコレーションバナー */}
                {isCompleted && (
                  <div className="absolute top-2 right-2 flex items-center gap-1 bg-emerald-500 text-white text-[10px] font-extrabold px-2 py-0.5 rounded-full shadow-xs">
                    <CheckCircle2 className="w-3 h-3" />
                    <span>目標達成！🎉</span>
                  </div>
                )}

                <div className="flex items-center justify-between pr-24">
                  <div className="flex items-center gap-2">
                    <div
                      className="w-3 h-3 rounded-full shrink-0"
                      style={{ backgroundColor: g.color || "#2E7D32" }}
                    />
                    <span className="text-xs font-extrabold text-content-main">{g.title}</span>
                  </div>
                </div>

                <div className="flex items-baseline justify-between text-xs font-bold text-content-main">
                  <span className="text-content-muted text-[11px]">現在積立額</span>
                  <div className="text-right">
                    <span className="font-display text-sm font-extrabold text-primary">
                      {formatCurrency(current)}
                    </span>
                    <span className="text-content-muted font-normal text-[11px] ml-1">
                      / {formatCurrency(target)}
                    </span>
                  </div>
                </div>

                {/* プログレスバー */}
                <div className="w-full h-3 bg-app-surface rounded-full overflow-hidden border border-border/40 p-0.5">
                  <div
                    className="h-full rounded-full transition-all duration-700 ease-out shadow-xs"
                    style={{
                      width: `${progress}%`,
                      backgroundColor: g.color || "#2E7D32",
                    }}
                  />
                </div>

                <div className="flex items-center justify-between text-[11px] text-content-muted pt-0.5">
                  <div className="flex items-center gap-2">
                    <span className="font-bold text-primary bg-primary-light px-2 py-0.5 rounded-md border border-primary-border">
                      {progress}%
                    </span>
                    {g.targetDate && (
                      <span className="flex items-center gap-1">
                        <Calendar className="w-3 h-3 text-content-subtle" />
                        <span>期日: {g.targetDate}</span>
                      </span>
                    )}
                  </div>
                  <span>
                    {isCompleted ? (
                      <span className="text-emerald-600 font-bold">達成済み</span>
                    ) : (
                      <>残り {formatCurrency(remaining)}</>
                    )}
                  </span>
                </div>

                {/* 紐付け口座タグ */}
                {targetAccounts.length > 0 && (
                  <div className="flex flex-wrap items-center gap-1.5 pt-1 border-t border-border/50 text-[10px] text-content-muted">
                    <span className="font-bold">対象口座:</span>
                    {targetAccounts.map((acc) => (
                      <span
                        key={acc.id}
                        className="px-2 py-0.5 bg-app-surface rounded-md border border-border font-medium"
                      >
                        {acc.icon} {acc.name} ({formatCurrency(acc.balance)})
                      </span>
                    ))}
                  </div>
                )}
              </div>
            );
          })
        )}
      </div>

      {/* 新規目標作成モーダル */}
      {showModal && (
        <div className="fixed inset-0 z-50 bg-black/50 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-app-surface border border-border rounded-3xl max-w-md w-full p-6 shadow-2xl flex flex-col gap-4 animate-in fade-in duration-200">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <div className="w-8 h-8 rounded-xl bg-primary-light flex items-center justify-center text-primary font-bold">
                  🌱
                </div>
                <h3 className="text-sm font-bold text-content-main">新しい貯蓄目標を作成</h3>
              </div>
              <button
                onClick={() => setShowModal(false)}
                className="w-8 h-8 rounded-xl hover:bg-app-subtle flex items-center justify-center text-content-muted"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleCreateGoal} className="space-y-3.5">
              <div>
                <label className="block text-xs font-bold text-content-muted mb-1">
                  目標のタイトル
                </label>
                <input
                  type="text"
                  placeholder="例: 年間100万円貯蓄, 旅行積立, 生活防衛資金"
                  value={newTitle}
                  onChange={(e) => setNewTitle(e.target.value)}
                  className="w-full px-3 py-2 bg-app-subtle border border-border rounded-xl text-xs font-medium focus:border-primary outline-none text-content-main"
                  required
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-content-muted mb-1">
                  目標金額 (円)
                </label>
                <input
                  type="number"
                  placeholder="1000000"
                  value={newTargetAmount}
                  onChange={(e) => setNewTargetAmount(e.target.value)}
                  className="w-full px-3 py-2 bg-app-subtle border border-border rounded-xl text-xs font-medium focus:border-primary outline-none text-content-main font-display"
                  required
                  min="1"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-content-muted mb-1">
                  目標達成予定日 (任意)
                </label>
                <input
                  type="date"
                  value={newTargetDate}
                  onChange={(e) => setNewTargetDate(e.target.value)}
                  className="w-full px-3 py-2 bg-app-subtle border border-border rounded-xl text-xs font-medium focus:border-primary outline-none text-content-main"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-content-muted mb-1.5">
                  集計対象の口座 (選択した口座の残高を自動合算)
                </label>
                <div className="space-y-1.5 max-h-36 overflow-y-auto pr-1">
                  {accounts.map((acc) => {
                    const checked = selectedAccountIds.includes(acc.id);
                    return (
                      <label
                        key={acc.id}
                        className={`flex items-center justify-between p-2 rounded-xl border text-xs cursor-pointer transition-all ${
                          checked
                            ? "bg-primary-light/60 border-primary text-primary font-bold"
                            : "bg-app-subtle border-border text-content-main hover:bg-app-subtle/80"
                        }`}
                      >
                        <div className="flex items-center gap-2">
                          <input
                            type="checkbox"
                            checked={checked}
                            onChange={() => handleToggleAccount(acc.id)}
                            className="rounded accent-primary"
                          />
                          <span>
                            {acc.icon} {acc.name}
                          </span>
                        </div>
                        <span className="font-display font-medium text-[11px]">
                          {formatCurrency(acc.balance)}
                        </span>
                      </label>
                    );
                  })}
                  {accounts.length === 0 && (
                    <p className="text-[11px] text-content-muted">口座が登録されていません</p>
                  )}
                </div>
              </div>

              <div>
                <label className="block text-xs font-bold text-content-muted mb-1.5">
                  テーマカラー
                </label>
                <div className="flex items-center gap-2">
                  {colorPresets.map((c) => (
                    <button
                      key={c}
                      type="button"
                      onClick={() => setSelectedColor(c)}
                      className={`w-7 h-7 rounded-full border-2 transition-transform ${
                        selectedColor === c ? "scale-110 border-content-main shadow-xs" : "border-transparent"
                      }`}
                      style={{ backgroundColor: c }}
                    />
                  ))}
                </div>
              </div>

              <div className="flex items-center justify-end gap-2 pt-2 border-t border-border">
                <button
                  type="button"
                  onClick={() => setShowModal(false)}
                  className="px-4 py-2 rounded-xl text-xs font-bold text-content-muted hover:bg-app-subtle transition-all"
                >
                  キャンセル
                </button>
                <button
                  type="submit"
                  disabled={isSubmitting}
                  className="px-5 py-2 rounded-xl text-xs font-bold bg-primary text-white shadow-xs hover:bg-primary-hover active:scale-98 transition-all disabled:opacity-50"
                >
                  {isSubmitting ? "作成中..." : "作成する"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
