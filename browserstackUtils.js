// browserstackUtils.js
async function getUnexecutedTestCases(username, accessKey, projectId, testRunId) {
    const baseUrl = "https://test-management.browserstack.com/api/v2";
    const authHeader = `Basic ${Buffer.from(`${username}:${accessKey}`).toString('base64')}`;
    const headers = {
        "Content-Type": "application/json",
        "Authorization": authHeader
    };

    try {
        const [allCasesResponse, testRunResponse] = await Promise.all([
            fetch(`${baseUrl}/projects/${projectId}/test-cases`, { headers }),
            fetch(`${baseUrl}/projects/${projectId}/test-runs/${testRunId}`, { headers })
        ]);

        if (!allCasesResponse.ok || !testRunResponse.ok) {
            throw new Error(`API call failed`);
        }

        const allCasesData = await allCasesResponse.json();
        const testRunData = await testRunResponse.json();

        const executedIds = new Set((testRunData.test_run?.test_cases || []).map(tc => tc.identifier));
        return (allCasesData.test_cases || []).filter(tc => !executedIds.has(tc.identifier));
    } catch (error) {
        console.error("❌ Error:", error.message);
        throw error;
    }
}

// Export the function so other files can use it
module.exports = { getUnexecutedTestCases };