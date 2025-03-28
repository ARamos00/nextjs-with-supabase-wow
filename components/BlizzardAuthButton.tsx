// components/BlizzardAuthButton.tsx
import Link from "next/link";

type BlizzardAuthButtonProps = {
  connected: boolean;
  battleTag?: string;
};

export default function BlizzardAuthButton({
  connected,
  battleTag,
}: BlizzardAuthButtonProps) {
  if (connected) {
    return (
      <div className="flex flex-col items-center gap-2">
        <p className="text-sm">
          Connected as <strong>{battleTag}</strong>
        </p>
        <Link
          href="/auth/logout"
          className="px-4 py-2 bg-red-600 text-white rounded hover:bg-red-700"
        >
          Disconnect Blizzard
        </Link>
      </div>
    );
  }
  return (
    <Link
      href="/auth/login"
      className="px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700"
    >
      Connect with Blizzard
    </Link>
  );
}
