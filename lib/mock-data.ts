export type ResourceType = "note" | "task" | "file" | "image" | "video" | "audio" | "link";
export type Resource = { id: string; title: string; type: ResourceType; detail: string; date: string; done?: boolean; content?: string; mimeType?: string };
export type Activity = { id: string; action: string; detail: string; time: string };
export type Scape = { id: string; title: string; description: string; template: string; cover: string; updated: string; resources: Resource[]; activity: Activity[] };
export type Template = { name: string; icon: string; color: string; description: string; sections: string[] };
export const templates = [
  { name: "Blank Scape", icon: "＋", color: "#eceee9", description: "A clear, open space for whatever comes next.", sections: [] },
  { name: "UI/UX Design", icon: "✦", color: "#dae7e0", description: "Turn loose ideas into a considered experience.", sections: ["Design brief", "User insights", "Moodboard"] },
  { name: "App Design", icon: "▣", color: "#dfe5f1", description: "Shape your product from first thought to launch.", sections: ["Product vision", "Flows", "Build list"] },
  { name: "Blog", icon: "✎", color: "#f5e5d6", description: "A focused home for your next great story.", sections: ["Article idea", "Research", "Outline"] },
  { name: "Research", icon: "◌", color: "#e7e1f0", description: "Collect, connect, and make sense of what you find.", sections: ["Research question", "Key sources", "Findings"] },
  { name: "Brainstorming", icon: "☼", color: "#f3edc8", description: "Let ideas arrive, then give them a shape.", sections: ["Open ideas", "Interesting paths", "Next experiment"] },
  { name: "Startup Planning", icon: "↗", color: "#dcebd7", description: "Keep the early, important pieces together.", sections: ["The opportunity", "Milestones", "Pitch notes"] },
  { name: "Study", icon: "⌇", color: "#dde8ef", description: "A clear study space for deep understanding.", sections: ["Learning goals", "Lecture notes", "Revision tasks"] },
  { name: "Content Creation", icon: "◒", color: "#f3dfdd", description: "Plan, make, and publish with less context switching.", sections: ["Content direction", "Ideas bank", "Publishing plan"] },
];
export const starterScapes: Scape[] = [];
