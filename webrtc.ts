export const iceServers: {
  urls: string | string[];
  username?: string;
  credential?: string;
}[] = [
  { urls: ["stun:stun.l.google.com:19302", "stun:stun1.l.google.com:19302"] },
  { urls: "stun:global.stun.twilio.com:3478" },
];

if (process.env.TURN_URL) {
  iceServers.push({
    urls: process.env.TURN_URL.split(",").map((u) => u.trim()),
    username: process.env.TURN_USERNAME,
    credential: process.env.TURN_CREDENTIAL,
  });
}
