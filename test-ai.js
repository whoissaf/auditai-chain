const { analyzeWithAI } = require('./src/services/aiService');

const code = "pragma solidity ^0.8.0;\ncontract VulnerableBank {\n function withdraw() public {\n  require(tx.origin == owner);\n  (bool success, ) = msg.sender.call{value: 1 ether}(\"\");\n }\n}";

console.log("Mencoba menghubungi AI Providers...");
analyzeWithAI(code, [{ title: "Test Static", severity: "high" }])
  .then(res => {
      console.log("✅ SUCCESS: AI berhasil merespon!");
      console.log("Risk Score:", res.overall_risk_score);
  })
  .catch(err => {
      console.error("❌ ERROR DETAIL:");
      console.error("Pesan:", err.message);
      if (err.response) {
          console.error("Status HTTP:", err.response.status);
          console.error("Response Data:", JSON.stringify(err.response.data, null, 2));
      }
  });
