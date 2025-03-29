// app/protected/page.tsx
import { createClient } from "@/utils/supabase/server";
import { InfoIcon } from "lucide-react";
import { redirect } from "next/navigation";
import { cookies } from "next/headers";
import BlizzardAuthButton from "@/components/BlizzardAuthButton";
import BlizzardProfile from "@/components/BlizzardProfile";


export default async function ProtectedPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return redirect("/sign-in");
  }

  const cookieStore = cookies();
  const battleTag = (await cookieStore).get("battleTag")?.value;
  const accessToken = (await cookieStore).get("accessToken")?.value;
  const connected = !!(battleTag && accessToken);

  return (
    <div className="flex-1 w-full flex flex-col gap-12 p-6">
      <div className="w-full flex justify-between items-center">
        <div className="bg-accent text-sm p-3 px-5 rounded-md text-foreground flex gap-3 items-center">
          <InfoIcon size="16" strokeWidth={2} />
          This is a protected page accessible only to authenticated users.
        </div>
      </div>

      <section className="flex flex-col gap-2">
        <h2 className="font-bold text-2xl mb-4">Your User Details</h2>
        <pre className="text-xs font-mono p-3 rounded border max-h-32 overflow-auto">
          {JSON.stringify(user, null, 2)}
        </pre>
      </section>

      <section className="flex flex-col gap-2">
        <h2 className="font-bold text-2xl mb-4">Blizzard OAuth</h2>
        <BlizzardAuthButton connected={connected} battleTag={battleTag} />
      </section>

      <section className="flex flex-col gap-2">
        <h2 className="font-bold text-2xl mb-4">Blizzard Account Profile</h2>
        {connected ? (
          <BlizzardProfile />
        ) : (
          <p>Connect your Blizzard account to see your profile data.</p>
        )}
      </section>
    </div>
  );
}