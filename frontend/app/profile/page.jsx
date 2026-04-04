import { ProfileWorkspacePage } from "@/components/AuthApp";

export default function ProfilePage() {
  return (
    <main className="relative min-h-screen overflow-hidden px-4 py-8 md:px-8 lg:px-12">
      <div className="hero-orb hero-orb-left" />
      <div className="hero-orb hero-orb-right" />

      <div className="mx-auto max-w-7xl space-y-8">
        <ProfileWorkspacePage />
      </div>
    </main>
  );
}
