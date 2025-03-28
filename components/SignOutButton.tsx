// components/SignOutButton.tsx
import Link from "next/link";

export default function SignOutButton() {
  return (
    <Link
      href="/auth/logout"
      className="px-4 py-2 bg-red-600 text-white rounded hover:bg-red-700"
    >
      Sign Out
    </Link>
  );
}
