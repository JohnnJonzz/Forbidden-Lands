import { Bird, Menu, ChevronDown } from "lucide-react";
import { imageUrl } from "@/lib/images";
import type { Session } from "@/lib/types";
// Presentation only: neither shell starts a gameplay controller.
export function CampaignHeader({
  session,
  campaignId,
  mobile,
  onMenu,
  aiProvider,
}: {
  session: Session;
  campaignId: string;
  mobile: boolean;
  onMenu: () => void;
  aiProvider: string;
}) {
  return (
    <header className="topbar">
      <button
        className="icon-button mobile-menu"
        aria-label="Toggle campaign sidebar"
        aria-expanded={mobile}
        onClick={onMenu}
      >
        <Menu />
      </button>
      <div className="brand-mark">
        <Bird size={29} />
      </div>
      <a className="brand" href="/">
        FORBIDDEN LANDS<span>THE RAVENLAND CHRONICLES</span>
      </a>
      <span className="header-divider" />
      <span className="campaign-badge">
        {session.campaign.name} <ChevronDown size={12} />
      </span>
      <div className="topbar-right">
        <span className="demo-pill">
          <span />
          {aiProvider === "openai"
            ? "AI GAME MASTER"
            : aiProvider === "phase7"
              ? "RAVENLAND CHRONICLES"
              : "INTERFACE PROTOTYPE"}
        </span>
        <span className="table-label">
          A table for {session.characters.length}
        </span>
        <div className="mini-avatars">
          {session.characters.map((c) => (
            <span key={c.id} style={{ color: c.color }}>
              {c.portraitId ? (
                <img
                  src={imageUrl(campaignId, c.portraitId, true)}
                  alt={`${c.name} portrait`}
                />
              ) : (
                c.initials
              )}
            </span>
          ))}
        </div>
      </div>
    </header>
  );
}
