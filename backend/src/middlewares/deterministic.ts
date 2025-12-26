import { NextFunction, Request, Response } from "express";
import { getSeed, parseFailurePattern, seededRandom } from "../utils/determinism.js";

let patternIndex = 0;

export async function deterministicBehavior(req: Request, res: Response, next: NextFunction) {
  const delay = Number(req.query.delay ?? process.env.AVERAGE_DELAY_MS ?? 0);
  const failProbability = Number(req.query.failProbability ?? process.env.FAILURE_RATE ?? 0);
  const seed = getSeed(req.query.seed as string | undefined, Number(process.env.GLOBAL_SEED ?? 42));
  const pattern = parseFailurePattern(process.env.FAILURE_PATTERN ?? (req.query.failurePattern as string | undefined));
  const random = seededRandom(seed + req.path.length);

  const shouldFail = pattern.length
    ? pattern[patternIndex++ % pattern.length] === "F"
    : random() < Math.min(1, Math.max(0, failProbability));

  if (delay > 0) {
    await new Promise((resolve) => setTimeout(resolve, delay));
  }

  if (shouldFail) {
    return res.status(500).json({
      error: {
        code: "DETERMINISTIC_FAILURE",
        message: "Simulated failure",
        details: { delay, failProbability }
      }
    });
  }

  return next();
}
