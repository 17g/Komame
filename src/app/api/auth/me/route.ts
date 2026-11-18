import { NextResponse } from "next/server";
import { getCurrentSession } from "@/lib/auth";
import { masterDb } from "@/db";
import { users, households } from "@/db/schema/master";
import { eq } from "drizzle-orm";

export async function GET() {
  const session = await getCurrentSession();
  if (!session) {
    return NextResponse.json({ user: null });
  }

  const [user] = await masterDb
    .select({
      id: users.id,
      email: users.email,
      themePreference: users.themePreference,
      isSuperAdmin: users.isSuperAdmin,
    })
    .from(users)
    .where(eq(users.id, session.userId))
    .limit(1);

  if (!user) {
    return NextResponse.json({ user: null });
  }

  const [household] = await masterDb
    .select({
      id: households.id,
      name: households.name,
    })
    .from(households)
    .where(eq(households.id, session.activeHouseholdId))
    .limit(1);

  return NextResponse.json({
    user: {
      ...user,
      isSuperAdmin: Boolean(user.isSuperAdmin),
      householdId: session.activeHouseholdId,
      householdName: household?.name || "我が家",
      role: session.role,
      schemaName: session.schemaName,
    },
  });
}
