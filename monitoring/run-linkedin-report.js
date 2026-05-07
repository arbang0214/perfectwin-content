#!/usr/bin/env node
/**
 * LinkedIn 리포트만 단독 발행 (테스트/수동 실행용).
 *
 * 사용법:
 *   node monitoring/run-linkedin-report.js
 */

const path = require("path");
require("dotenv").config({ path: path.join(__dirname, "..", ".env") });

const { generateLinkedInReport } = require("./linkedin-report");

generateLinkedInReport()
  .then(() => console.log("\n✅ LinkedIn 리포트 발행 완료\n"))
  .catch((err) => {
    console.error("치명적 오류:", err);
    process.exit(1);
  });
