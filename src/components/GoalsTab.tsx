"use client";

import React, { useState, useMemo } from "react";
import { SavingsGoalItem, TransactionItem, AccountItem, CategoryItem } from "@/types";
import { formatCurrency } from "@/lib/utils";
import {
  calculateActiveGoalsSummary,
  calculateGoalProgressRate,
  canArchiveGoal,
  canDeleteGoal,
  DEFAULT_GOAL_COLOR,
  GOAL_COLOR_PRESETS,
  isGoalAchieved,
  MAX_GOAL_TITLE_LENGTH,
  validateGoalInput,
} from "@/lib/goal-helpers";
import {
  Target,
  Sprout,
  Sparkles,
  Plus,
  Flame,
  CheckCircle2,
  Calendar,
  X,
  Pencil,
  Trash2,
  Archive,
  RotateCcw,
  AlertTriangle,
  ChevronDown,
  ChevronUp,
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
  onTriggerToast,
  onRefreshGoals,
}: GoalsTabProps) {
  // 目標作成・編集共通モーダルの状態
  const [showModal, setShowModal] = useState(false);
  const [editingGoal, setEditingGoal] = useState<SavingsGoalItem | null>(null);
  const [formTitle, setFormTitle] = useState("");
  const [formTargetAmount, setFormTargetAmount] = useState("");
  const [formTargetDate, setFormTargetDate] = useState("");
  const [selectedAccountIds, setSelectedAccountIds] = useState<string[]>([]);
  const [selectedColor, setSelectedColor] = useState(DEFAULT_GOAL_COLOR);
  const [isSubmitting, setIsSubmitting] = useState(false);

  // 未達成目標の削除確認モーダル & 操作中ロック状態
  const [deleteTargetGoal, setDeleteTargetGoal] = useState<SavingsGoalItem | null>(null);
  const [processingGoalId, setProcessingGoalId] = useState<string | null>(null);

  // アーカイブ済み目標一覧の表示トグル
  const [showArchived, setShowArchived] = useState(false);

  // 進行中目標とアーカイブ済み目標の分離
  const activeGoals = useMemo(
    () => (goals || []).filter((g) => !g.isArchived),
    [goals]
  );
  const archivedGoals = useMemo(
    () => (goals || []).filter((g) => Boolean(g.isArchived)),
    [goals]
  );

  // 1. こまめ活動（ストリーク & 記帳実績）の動的集計
  const {
    streakDays,
    distinctDaysThisMonth,
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
    const monthDaysSet = new Set<string>();

    (transactions || []).forEach((t) => {
      const d = t.date ? t.date.split("T")[0] : t.createdAt ? t.createdAt.split("T")[0] : null;
      if (d) {
        counts[d] = (counts[d] || 0) + 1;
        if (d.startsWith(currentMonthPrefix)) {
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
      distinctDaysThisMonth: monthDaysSet.size,
    };
  }, [transactions]);

  // 2. 進行中（未アーカイブ）貯蓄目標のみの総合進捗集計
  const { totalTargetAmount, totalCurrentAmount, overallProgressRate } = useMemo(
    () => calculateActiveGoalsSummary(goals),
    [goals]
  );

  // 3. まめの樹育成システム：ステージ動的遷移（種 / 双葉 / 新芽 / 実り）
  const sproutStage = useMemo(() => {
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

  // 4. 今月の収支・前月比節約額・やさしいアドバイスの動的生成（進行中目標のみ対象）
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
        content:
          "日々の支出を見える化できていることが安心への一番の近道です。焦らずマイペースに記録を重ねていきましょう。",
      });
    }

    // ② 目標達成ペース・見通しアドバイス（アーカイブ済み目標は除外し進行中目標のみ判定）
    if (activeGoals.length > 0) {
      const mainGoal =
        activeGoals.find(
          (g) => !isGoalAchieved(g.currentAmount ?? 0, g.targetAmount, g.isCompleted)
        ) ?? activeGoals[0];
      const targetAmount = mainGoal.targetAmount;
      const currentAmount = mainGoal.currentAmount ?? 0;
      const remainingAmount = Math.max(0, targetAmount - currentAmount);

      if (isGoalAchieved(currentAmount, targetAmount, mainGoal.isCompleted)) {
        adviceList.push({
          icon: "🎉",
          title: "目標達成おめでとうございます！",
          content: `「${mainGoal.title}」の目標金額（${formatCurrency(targetAmount)}）を見事に達成しました！達成済み目標はアーカイブして次の目標へ進むこともできます。`,
        });
      } else {
        const rate = calculateGoalProgressRate(currentAmount, targetAmount);
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
  }, [transactions, activeGoals, streakDays]);

  // モーダルを開く（新規作成）
  const openCreateModal = () => {
    setEditingGoal(null);
    setFormTitle("");
    setFormTargetAmount("");
    setFormTargetDate("");
    setSelectedAccountIds([]);
    setSelectedColor(DEFAULT_GOAL_COLOR);
    setShowModal(true);
  };

  // モーダルを開く（編集）
  const openEditModal = (goal: SavingsGoalItem) => {
    setEditingGoal(goal);
    setFormTitle(goal.title);
    setFormTargetAmount(String(goal.targetAmount));
    setFormTargetDate(goal.targetDate || "");
    setSelectedAccountIds(Array.isArray(goal.accountIdsJson) ? goal.accountIdsJson : []);
    setSelectedColor(goal.color || DEFAULT_GOAL_COLOR);
    setShowModal(true);
  };

  const closeModal = () => {
    setShowModal(false);
    setEditingGoal(null);
  };

  // 目標の作成・更新共通送信処理
  const handleSubmitGoal = async (e: React.FormEvent) => {
    e.preventDefault();
    const rawAmountStr = formTargetAmount.replace(/,/g, "").trim();
    const parsedAmt = Number(rawAmountStr);

    const validation = validateGoalInput({
      title: formTitle,
      targetAmount: rawAmountStr.length > 0 && Number.isFinite(parsedAmt) ? parsedAmt : NaN,
      targetDate: formTargetDate || null,
      accountIds: selectedAccountIds,
      color: selectedColor,
    });

    if (!validation.ok) {
      onTriggerToast(validation.error);
      return;
    }

    setIsSubmitting(true);
    try {
      const isEdit = editingGoal !== null;
      const res = await fetch("/api/goals", {
        method: isEdit ? "PUT" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(
          isEdit
            ? {
                action: "update",
                id: editingGoal.id,
                ...validation.data,
              }
            : validation.data
        ),
      });

      const data = await res.json().catch(() => ({}));
      if (res.ok) {
        onTriggerToast(
          isEdit
            ? `貯蓄目標「${validation.data.title}」を更新しました`
            : "新しい貯蓄目標を作成しました！🌱"
        );
        closeModal();
        onRefreshGoals?.();
      } else {
        onTriggerToast(
          data.error || (isEdit ? "目標の更新に失敗しました" : "目標の作成に失敗しました")
        );
      }
    } catch {
      onTriggerToast("通信エラーが発生しました");
    } finally {
      setIsSubmitting(false);
    }
  };

  // 未達成目標の物理削除処理
  const handleConfirmDeleteGoal = async () => {
    if (!deleteTargetGoal || processingGoalId) return;

    const current = deleteTargetGoal.currentAmount ?? 0;
    const deleteCheck = canDeleteGoal({
      currentAmount: current,
      targetAmount: deleteTargetGoal.targetAmount,
      isCompleted: deleteTargetGoal.isCompleted,
      isArchived: deleteTargetGoal.isArchived,
    });

    if (!deleteCheck.allowed) {
      onTriggerToast(deleteCheck.reason || "この目標は削除できません");
      setDeleteTargetGoal(null);
      return;
    }

    setProcessingGoalId(deleteTargetGoal.id);
    try {
      const res = await fetch(`/api/goals?id=${encodeURIComponent(deleteTargetGoal.id)}`, {
        method: "DELETE",
      });
      const data = await res.json().catch(() => ({}));
      if (res.ok) {
        onTriggerToast(data.message || `貯蓄目標「${deleteTargetGoal.title}」を削除しました`);
        setDeleteTargetGoal(null);
        onRefreshGoals?.();
      } else {
        onTriggerToast(data.error || "目標の削除に失敗しました");
      }
    } catch {
      onTriggerToast("通信エラーが発生しました");
    } finally {
      setProcessingGoalId(null);
    }
  };

  // 達成済み目標のアーカイブ処理
  const handleArchiveGoal = async (goal: SavingsGoalItem) => {
    if (processingGoalId) return;

    const current = goal.currentAmount ?? 0;
    const archiveCheck = canArchiveGoal({
      currentAmount: current,
      targetAmount: goal.targetAmount,
      isCompleted: goal.isCompleted,
      isArchived: goal.isArchived,
    });

    if (!archiveCheck.allowed) {
      onTriggerToast(archiveCheck.reason || "達成済みの目標のみアーカイブできます");
      return;
    }

    setProcessingGoalId(goal.id);
    try {
      const res = await fetch("/api/goals", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "archive", id: goal.id }),
      });
      const data = await res.json().catch(() => ({}));
      if (res.ok) {
        onTriggerToast(data.message || `貯蓄目標「${goal.title}」をアーカイブしました`);
        onRefreshGoals?.();
      } else {
        onTriggerToast(data.error || "目標のアーカイブに失敗しました");
      }
    } catch {
      onTriggerToast("通信エラーが発生しました");
    } finally {
      setProcessingGoalId(null);
    }
  };

  // アーカイブ済み目標の進行中一覧への復元処理
  const handleRestoreGoal = async (goal: SavingsGoalItem) => {
    if (processingGoalId) return;

    setProcessingGoalId(goal.id);
    try {
      const res = await fetch("/api/goals", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "restore", id: goal.id }),
      });
      const data = await res.json().catch(() => ({}));
      if (res.ok) {
        onTriggerToast(
          data.message || `貯蓄目標「${goal.title}」を進行中一覧へ復元しました`
        );
        onRefreshGoals?.();
      } else {
        onTriggerToast(data.error || "目標の復元に失敗しました");
      }
    } catch {
      onTriggerToast("通信エラーが発生しました");
    } finally {
      setProcessingGoalId(null);
    }
  };

  const handleToggleAccount = (accId: string) => {
    setSelectedAccountIds((prev) =>
      prev.includes(accId) ? prev.filter((id) => id !== accId) : [...prev, accId]
    );
  };

  return (
    <div className="flex flex-col gap-5 pb-24">
      {/* 1. まめの樹 育成システム (要件16-2: 実データ動的連動) */}
      <div className="p-5 bg-gradient-to-br from-app-surface via-app-surface to-primary-light/30 border border-primary-border rounded-2xl shadow-sm flex flex-col gap-4">
        <div className="flex items-center justify-between flex-wrap gap-2">
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
          <span className="font-bold text-primary shrink-0 ml-2">今月 {distinctDaysThisMonth}日記録</span>
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
            <p className="text-[11px] text-content-muted">収支と進行中目標のペースに合わせた前向きなメッセージ</p>
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
        <div className="flex items-center justify-between gap-2">
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
            type="button"
            onClick={openCreateModal}
            className="flex items-center gap-1 px-3 py-1.5 bg-primary text-white rounded-xl text-xs font-bold shadow-xs hover:bg-primary-hover active:scale-95 transition-all cursor-pointer"
          >
            <Plus className="w-3.5 h-3.5" />
            <span>目標を追加</span>
          </button>
        </div>

        {/* 進行中目標サマリーバナー (アーカイブ済み目標は集計対象外) */}
        {activeGoals.length > 0 && (
          <div className="flex items-center justify-between p-3.5 bg-app-subtle rounded-xl border border-border text-xs">
            <div>
              <span className="text-content-muted block text-[10px] font-bold">
                進行中目標の合算進捗（{activeGoals.length}件）
              </span>
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

        {/* 進行中の各目標カード */}
        {activeGoals.length === 0 ? (
          <div className="p-8 text-center bg-app-subtle rounded-xl border border-dashed border-border flex flex-col items-center gap-2">
            <span className="text-3xl">🌱</span>
            <p className="text-xs font-bold text-content-main">
              {archivedGoals.length > 0
                ? "現在進行中の貯蓄目標はありません"
                : "まだ貯蓄目標が登録されていません"}
            </p>
            <p className="text-[11px] text-content-muted max-w-sm">
              {archivedGoals.length > 0
                ? "新しい目標を作成するか、下の「アーカイブ済みを表示」から過去の達成目標を進行中へ復元できます。"
                : "「年間100万円貯蓄」や「旅行積立」など、叶えたい目標を登録すると自動で進捗を集計します。"}
            </p>
            <button
              type="button"
              onClick={openCreateModal}
              className="mt-2 px-4 py-2 bg-primary text-white text-xs font-bold rounded-xl shadow-xs hover:bg-primary-hover transition-all cursor-pointer"
            >
              {archivedGoals.length > 0 ? "新しい目標を作成する" : "最初の目標を作成する"}
            </button>
          </div>
        ) : (
          <div className="flex flex-col gap-3">
            {activeGoals.map((g) => {
              const current = g.currentAmount ?? 0;
              const target = g.targetAmount;
              const progress =
                g.progressRate ?? calculateGoalProgressRate(current, target);
              const achieved = isGoalAchieved(current, target, g.isCompleted);
              const remaining = Math.max(0, target - current);
              const isBusy = processingGoalId === g.id;

              const targetAccounts = accounts.filter((a) =>
                (g.accountIdsJson as string[] | undefined)?.includes(a.id)
              );

              return (
                <div
                  key={g.id}
                  className={`p-4 bg-app-subtle rounded-xl border flex flex-col gap-3 transition-colors ${
                    achieved ? "border-emerald-500/40" : "border-border"
                  }`}
                >
                  {/* カードヘッダー: タイトル + 達成バッジ + アクションボタン */}
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div className="flex items-center gap-2 min-w-0 flex-1">
                      <div
                        className="w-3 h-3 rounded-full shrink-0"
                        style={{ backgroundColor: g.color || DEFAULT_GOAL_COLOR }}
                      />
                      <span className="text-xs font-extrabold text-content-main truncate">
                        {g.title}
                      </span>
                      {achieved && (
                        <span className="inline-flex items-center gap-1 bg-emerald-500 text-white text-[10px] font-extrabold px-2 py-0.5 rounded-full shadow-xs shrink-0">
                          <CheckCircle2 className="w-3 h-3" />
                          <span>目標達成！🎉</span>
                        </span>
                      )}
                    </div>

                    {/* アクションボタン群 */}
                    <div className="flex items-center gap-1.5 shrink-0">
                      <button
                        type="button"
                        onClick={() => openEditModal(g)}
                        disabled={isBusy}
                        className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg border border-border bg-app-surface text-[11px] font-bold text-content-main hover:border-primary hover:text-primary transition-colors disabled:opacity-50 cursor-pointer"
                        title="目標を編集"
                      >
                        <Pencil className="w-3 h-3" />
                        <span>編集</span>
                      </button>

                      {achieved ? (
                        <button
                          type="button"
                          onClick={() => handleArchiveGoal(g)}
                          disabled={isBusy}
                          className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg border border-emerald-500/40 bg-emerald-500/10 text-[11px] font-bold text-emerald-700 dark:text-emerald-400 hover:bg-emerald-500/20 transition-colors disabled:opacity-50 cursor-pointer"
                          title="達成済み目標をアーカイブへ移動"
                        >
                          <Archive className="w-3 h-3" />
                          <span>{isBusy ? "処理中..." : "アーカイブ"}</span>
                        </button>
                      ) : (
                        <button
                          type="button"
                          onClick={() => setDeleteTargetGoal(g)}
                          disabled={isBusy}
                          className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg border border-red-500/30 bg-red-500/5 text-[11px] font-bold text-red-600 dark:text-red-400 hover:bg-red-500/15 transition-colors disabled:opacity-50 cursor-pointer"
                          title="未達成の目標を削除"
                        >
                          <Trash2 className="w-3 h-3" />
                          <span>削除</span>
                        </button>
                      )}
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
                        backgroundColor: g.color || DEFAULT_GOAL_COLOR,
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
                      {achieved ? (
                        <span className="text-emerald-600 dark:text-emerald-400 font-bold">
                          達成済み（アーカイブで履歴保管可）
                        </span>
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
            })}
          </div>
        )}

        {/* アーカイブ済み達成目標表示トグル & 一覧 */}
        <div className="pt-3 border-t border-border/60">
          <button
            type="button"
            onClick={() => setShowArchived((prev) => !prev)}
            className="text-[11px] font-bold text-content-muted hover:text-primary transition-colors flex items-center gap-1.5 cursor-pointer"
          >
            <Archive className="w-3.5 h-3.5" />
            <span>
              {showArchived
                ? `アーカイブ済みを隠す（${archivedGoals.length}件）`
                : `アーカイブ済みを表示（${archivedGoals.length}件）`}
            </span>
            {showArchived ? (
              <ChevronUp className="w-3.5 h-3.5" />
            ) : (
              <ChevronDown className="w-3.5 h-3.5" />
            )}
          </button>

          {showArchived && (
            <div className="mt-3 space-y-2.5">
              {archivedGoals.length === 0 ? (
                <div className="p-4 bg-app-subtle/60 border border-border/60 rounded-xl text-center text-xs text-content-muted">
                  アーカイブ済みの達成目標はありません
                </div>
              ) : (
                archivedGoals.map((g) => {
                  const current = g.currentAmount ?? 0;
                  const target = g.targetAmount;
                  const progress =
                    g.progressRate ?? calculateGoalProgressRate(current, target);
                  const isBusy = processingGoalId === g.id;
                  const targetAccounts = accounts.filter((a) =>
                    (g.accountIdsJson as string[] | undefined)?.includes(a.id)
                  );

                  return (
                    <div
                      key={g.id}
                      className="p-3.5 bg-app-subtle/60 border border-border/70 rounded-xl flex flex-col gap-2.5 opacity-90"
                    >
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <div className="flex items-center gap-2 min-w-0 flex-1">
                          <div
                            className="w-2.5 h-2.5 rounded-full shrink-0"
                            style={{ backgroundColor: g.color || DEFAULT_GOAL_COLOR }}
                          />
                          <span className="text-xs font-bold text-content-main truncate">
                            {g.title}
                          </span>
                          <span className="inline-flex items-center gap-1 bg-stone-500/15 text-content-muted border border-border text-[10px] font-bold px-2 py-0.5 rounded-full shrink-0">
                            <CheckCircle2 className="w-3 h-3 text-emerald-600" />
                            <span>達成・アーカイブ済</span>
                          </span>
                        </div>

                        {/* 復元ボタンのみ配置（達成履歴保護のため削除ボタンは非表示） */}
                        <button
                          type="button"
                          onClick={() => handleRestoreGoal(g)}
                          disabled={isBusy}
                          className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg border border-emerald-500/30 bg-app-surface text-[11px] font-bold text-emerald-700 dark:text-emerald-400 hover:bg-emerald-500/10 transition-colors disabled:opacity-50 shrink-0 cursor-pointer"
                        >
                          <RotateCcw className="w-3 h-3" />
                          <span>{isBusy ? "復元中..." : "復元（進行中に戻す）"}</span>
                        </button>
                      </div>

                      <div className="flex items-center justify-between text-[11px] text-content-muted">
                        <span>
                          積立額:{" "}
                          <strong className="text-content-main font-display">
                            {formatCurrency(current)}
                          </strong>{" "}
                          / {formatCurrency(target)}（{progress}%）
                        </span>
                        {g.targetDate && (
                          <span className="flex items-center gap-1">
                            <Calendar className="w-3 h-3" />
                            <span>期日: {g.targetDate}</span>
                          </span>
                        )}
                      </div>

                      <div className="w-full h-2 bg-app-surface rounded-full overflow-hidden border border-border/40">
                        <div
                          className="h-full rounded-full opacity-75"
                          style={{
                            width: `${progress}%`,
                            backgroundColor: g.color || DEFAULT_GOAL_COLOR,
                          }}
                        />
                      </div>

                      {targetAccounts.length > 0 && (
                        <div className="flex flex-wrap items-center gap-1 text-[10px] text-content-muted">
                          <span className="font-bold">対象口座:</span>
                          {targetAccounts.map((acc) => (
                            <span
                              key={acc.id}
                              className="px-1.5 py-0.5 bg-app-surface rounded border border-border/70"
                            >
                              {acc.icon} {acc.name}
                            </span>
                          ))}
                        </div>
                      )}
                    </div>
                  );
                })
              )}
            </div>
          )}
        </div>
      </div>

      {/* 目標作成・編集共通モーダル */}
      {showModal && (
        <div className="fixed inset-0 z-50 bg-black/50 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-app-surface border border-border rounded-3xl max-w-md w-full max-h-[90vh] overflow-y-auto p-6 shadow-2xl flex flex-col gap-4 animate-in fade-in duration-200">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <div className="w-8 h-8 rounded-xl bg-primary-light flex items-center justify-center text-primary font-bold">
                  {editingGoal ? <Pencil className="w-4 h-4" /> : "🌱"}
                </div>
                <h3 className="text-sm font-bold text-content-main">
                  {editingGoal ? "貯蓄目標を編集" : "新しい貯蓄目標を作成"}
                </h3>
              </div>
              <button
                type="button"
                onClick={closeModal}
                className="w-8 h-8 rounded-xl hover:bg-app-subtle flex items-center justify-center text-content-muted cursor-pointer"
                aria-label="モーダルを閉じる"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleSubmitGoal} className="space-y-3.5">
              <div>
                <label className="block text-xs font-bold text-content-muted mb-1">
                  目標のタイトル
                </label>
                <input
                  type="text"
                  placeholder="例: 年間100万円貯蓄, 旅行積立, 生活防衛資金"
                  value={formTitle}
                  onChange={(e) => setFormTitle(e.target.value)}
                  maxLength={MAX_GOAL_TITLE_LENGTH}
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
                  inputMode="numeric"
                  placeholder="1000000"
                  value={formTargetAmount}
                  onChange={(e) => setFormTargetAmount(e.target.value)}
                  className="w-full px-3 py-2 bg-app-subtle border border-border rounded-xl text-xs font-medium focus:border-primary outline-none text-content-main font-display"
                  required
                  min={1}
                  max={9999999999}
                  step={1}
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-content-muted mb-1">
                  目標達成予定日 (任意)
                </label>
                <input
                  type="date"
                  value={formTargetDate}
                  onChange={(e) => setFormTargetDate(e.target.value)}
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
                  {GOAL_COLOR_PRESETS.map((c) => (
                    <button
                      key={c}
                      type="button"
                      onClick={() => setSelectedColor(c)}
                      className={`w-7 h-7 rounded-full border-2 transition-transform cursor-pointer ${
                        selectedColor.toUpperCase() === c
                          ? "scale-110 border-content-main shadow-xs"
                          : "border-transparent"
                      }`}
                      style={{ backgroundColor: c }}
                      aria-label={`テーマカラー ${c}`}
                    />
                  ))}
                </div>
              </div>

              <div className="flex items-center justify-end gap-2 pt-2 border-t border-border">
                <button
                  type="button"
                  onClick={closeModal}
                  className="px-4 py-2 rounded-xl text-xs font-bold text-content-muted hover:bg-app-subtle transition-all cursor-pointer"
                >
                  キャンセル
                </button>
                <button
                  type="submit"
                  disabled={isSubmitting}
                  className="px-5 py-2 rounded-xl text-xs font-bold bg-primary text-white shadow-xs hover:bg-primary-hover active:scale-98 transition-all disabled:opacity-50 cursor-pointer"
                >
                  {isSubmitting
                    ? editingGoal
                      ? "保存中..."
                      : "作成中..."
                    : editingGoal
                    ? "保存する"
                    : "作成する"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* 未達成目標の削除確認モーダル（誤操作防止） */}
      {deleteTargetGoal && (
        <div className="fixed inset-0 z-50 bg-black/50 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-app-surface border border-border rounded-3xl max-w-sm w-full p-6 shadow-2xl flex flex-col gap-4 animate-in fade-in duration-200">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-2xl bg-red-500/10 border border-red-500/30 flex items-center justify-center text-red-600 shrink-0">
                <AlertTriangle className="w-5 h-5" />
              </div>
              <div>
                <h3 className="text-sm font-bold text-content-main">貯蓄目標を削除しますか？</h3>
                <p className="text-[11px] text-content-muted">未達成目標の削除（取り消し不可）</p>
              </div>
            </div>

            <div className="p-3 bg-app-subtle rounded-xl border border-border text-xs space-y-1">
              <p className="font-bold text-content-main">{deleteTargetGoal.title}</p>
              <p className="text-[11px] text-content-muted">
                目標金額: {formatCurrency(deleteTargetGoal.targetAmount)} / 現在:{" "}
                {formatCurrency(deleteTargetGoal.currentAmount ?? 0)}
              </p>
            </div>

            <p className="text-[11px] text-content-muted leading-relaxed">
              この操作は取り消せません。紐付けられた口座自体の残高は変更されません。
            </p>

            <div className="flex items-center justify-end gap-2 pt-2 border-t border-border">
              <button
                type="button"
                onClick={() => setDeleteTargetGoal(null)}
                disabled={processingGoalId === deleteTargetGoal.id}
                className="px-4 py-2 rounded-xl text-xs font-bold text-content-muted hover:bg-app-subtle transition-all disabled:opacity-50 cursor-pointer"
              >
                キャンセル
              </button>
              <button
                type="button"
                onClick={handleConfirmDeleteGoal}
                disabled={processingGoalId === deleteTargetGoal.id}
                className="px-4 py-2 rounded-xl text-xs font-bold bg-red-600 text-white shadow-xs hover:bg-red-700 active:scale-98 transition-all disabled:opacity-50 cursor-pointer"
              >
                {processingGoalId === deleteTargetGoal.id ? "削除中..." : "削除する"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
