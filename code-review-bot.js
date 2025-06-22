const { Octokit } = require("@octokit/rest");
const { WebClient } = require("@slack/web-api");
const { Client } = require("twilio");
const { ChatOpenAI } = require("@langchain/openai");
const { HumanMessage } = require("@langchain/core/messages");

require("dotenv").config();

const octokit = new Octokit({ auth: process.env.GH_TOKEN });
const slack = new WebClient(process.env.SLACK_TOKEN);
const twilio = new Client(process.env.TWILIO_SID, process.env.TWILIO_AUTH_TOKEN);
const llm = new ChatOpenAI({
  model: "gpt-4",
  apiKey: process.env.AI_API_KEY,
});

async function getCommitChanges(owner, repo, commitSha) {
  try {
    const { data } = await octokit.repos.getCommit({ owner, repo, ref: commitSha });
    const files = data.files;
    let changes = "";
    for (const file of files) {
      changes += `File: ${file.filename}\nStatus: ${file.status}\nChanges:\n${file.patch || "No diff available"}\n\n`;
    }
    return changes;
  } catch (error) {
    console.error("Error fetching commit changes:", error);
    return "";
  }
}

async function reviewCode(changes) {
  try {
    const prompt = new HumanMessage({
      content: `You are an expert code reviewer. Review the following code changes and provide detailed feedback on code quality, potential bugs, and improvements. Use markdown formatting for clarity:\n\n${changes}`,
    });
    const response = await llm.invoke([prompt]);
    return response.content;
  } catch (error) {
    console.error("Error reviewing code:", error);
    return "Unable to generate code review.";
  }
}

async function sendToSlack(message, webhookUrl) {
  try {
    await axios.post(webhookUrl, { text: message });
    console.log("Feedback sent to Slack");
  } catch (error) {
    console.error("Error sending to Slack:", error);
  }
}

async function sendToWhatsApp(message, toNumber) {
  try {
    await twilio.messages.create({
      body: message,
      from: `whatsapp:${process.env.TWILIO_PHONE_NUMBER}`,
      to: `whatsapp:${toNumber}`,
    });
    console.log("Feedback sent to WhatsApp");
  } catch (error) {
    console.error("Error sending to WhatsApp:", error);
  }
}

async function main() {
  const { GITHUB_REPOSITORY, GITHUB_SHA, SLACK_WEBHOOK_URL, WHATSAPP_NUMBER } = process.env;
  const [owner, repo] = GITHUB_REPOSITORY.split("/");
  const commitSha = GITHUB_SHA;

  const changes = await getCommitChanges(owner, repo, commitSha);
  if (!changes) {
    console.log("No changes to review.");
    return;
  }

  const review = await reviewCode(changes);
  const message = `Code Review for Commit ${commitSha.slice(0, 7)}:\n\n${review}`;

  if (SLACK_WEBHOOK_URL) {
    await sendToSlack(message, SLACK_WEBHOOK_URL);
  }

  if (WHATSAPP_NUMBER) {
    await sendToWhatsApp(message, WHATSAPP_NUMBER);
  }
}

main().catch(console.error);