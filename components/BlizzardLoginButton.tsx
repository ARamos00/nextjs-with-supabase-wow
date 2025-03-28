// components/BlizzardLoginButton.tsx
import Link from "next/link";

export default function BlizzardLoginButton() {
  return (
    <Link
      href="/auth/login"
      className="px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700"
    >
      Connect with Blizzard
    </Link>
  );
}
