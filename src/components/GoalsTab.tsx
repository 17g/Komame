"use client";

import React, { useState } from "react";
import { SavingsGoalItem } from "@/types";
import { formatCurrency } from "@/lib/utils";
import { Target, Sprout, Sparkles, Award } from "lucide-react";

interface GoalsTabProps {
  goals: SavingsGoalItem[];
  onTriggerToast: (msg: string) => void;
}

export function GoalsTab({ goals, onTriggerToast }: GoalsTabProps) {
  return (
    <div className="flex flex-col gap-4 pb-20">
      {/* 貯蓄目標カード */}
      <div className="p-4 bg-app-surface border border-border rounded-xl shadow-sm">
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-1.5 text-xs font-bold text-content-main">
            <Target className="w-4 h-4 text-primary" />
            <span>🎯 貯蓄目標の進捗</span>
          </div>
          <span className="text-[11px] font-bold text-primary bg-primary-light px-2 py-0.5 rounded-full border border-primary-border">
            達成率 74%
          </span>
        </div>

        {goals.map((g) => (
          <div key={g.id} className="flex flex-col gap-2 mb-4 last:mb-0">
            <div className="flex items-center justify-between text-xs font-bold text-content-main">
              <span>{g.title}</span>
              <span className="font-display">
                {formatCurrency(g.currentAmount || 740000)} / {formatCurrency(g.targetAmount)}
              </span>
            </div>

            {/* 進捗バー */}
            <div className="w-full h-2.5 bg-app-subtle rounded-full overflow-hidden">
              <div
                className="h-full bg-primary rounded-full transition-all duration-500"
                style={{ width: `${g.progressRate || 74}%` }}
              />
            </div>

            <div className="flex items-center justify-between text-[10px] text-content-muted">
              <span>期日: {g.targetDate || "2026/12/31"}</span>
              <span>残り {formatCurrency(g.targetAmount - (g.currentAmount || 740000))}</span>
            </div>
          </div>
        ))}
      </div>

      {/* まめの樹 育成システム (要件16) */}
      <div className="p-4 bg-gradient-to-br from-app-surface to-primary-light/30 border border-primary-border rounded-xl shadow-sm flex items-center gap-4">
        <div className="w-16 h-16 rounded-2xl bg-primary-light border border-primary-border flex items-center justify-center text-3xl shadow-sm">
          🌱
        </div>
        <div className="flex-1">
          <div className="flex items-center gap-1 text-xs font-extrabold text-primary">
            <Sprout className="w-4 h-4" />
            <span>こまめちゃん: ステージ 3「すくすく新芽」</span>
          </div>
          <p className="text-[11px] text-content-muted mt-1 leading-relaxed">
            日々の家計簿記録と貯蓄の積み重ねで、こまめの樹が元気に成長しています！
          </p>
        </div>
      </div>

      {/* 温かいスマート・アドバイス (要件16-3) */}
      <div className="p-4 bg-app-surface border border-border rounded-xl shadow-sm flex items-start gap-3">
        <Sparkles className="w-5 h-5 text-accent shrink-0 mt-0.5" />
        <div>
          <span className="text-xs font-bold text-content-main block mb-1">
            💡 こまめからのやさしいアドバイス
          </span>
          <p className="text-xs text-content-muted leading-relaxed">
            今月は外食費が予算より <b>¥4,200</b> 節約できています！このペースを維持すると、予定より1ヶ月早い11月中に年間100万円の貯蓄目標を達成できますよ🌱
          </p>
        </div>
      </div>
    </div>
  );
}
