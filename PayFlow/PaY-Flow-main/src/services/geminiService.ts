import { GoogleGenAI, ThinkingLevel } from "@google/genai";

const getAI = () => {
  const apiKey = process.env.GEMINI_API_KEY || process.env.APP_API_KEY;
  if (!apiKey) {
    throw new Error('Gemini API key is missing.');
  }
  return new GoogleGenAI({ apiKey });
};

export const generateInviteEmail = async (organisationName: string, role: string, invitedBy: string, inviteLink: string) => {
  const prompt = `Draft a professional and welcoming invitation email for a new team member joining "${organisationName}".
  
  Details:
  - Role: ${role}
  - Invited by: ${invitedBy}
  - Invite Link: ${inviteLink}`;

  try {
    const ai = getAI();
    const response = await ai.models.generateContent({
      model: "gemini-3.1-pro-preview",
      contents: prompt,
      config: {
        systemInstruction: `You are a professional business communication expert. 
        The email should be clear, concise, and encourage them to sign up. Include instructions on how to use the link.
        Use South African English spellings (e.g., organisation, programme, centre).
        Return ONLY the subject and the body of the email in a JSON format like this:
        {
          "subject": "...",
          "body": "..."
        }`,
        thinkingConfig: { thinkingLevel: ThinkingLevel.HIGH },
        responseMimeType: "application/json"
      }
    });

    return JSON.parse(response.text || '{}');
  } catch (error) {
    console.error('Error generating invite email:', error);
    return {
      subject: `Invitation to join ${organisationName}`,
      body: `Hi there,\n\nYou have been invited to join ${organisationName} as a ${role} by ${invitedBy}.\n\nPlease use the following link to sign up and join the team:\n${inviteLink}\n\nBest regards,\nThe ${organisationName} Team`
    };
  }
};

export const generateRequisitionDescription = async (invoiceNumber: string, contactName: string, amount: number) => {
  const prompt = `Generate a concise, professional description for a financial requisition.
  Details:
  - Invoice: ${invoiceNumber}
  - Supplier/Contact: ${contactName}
  - Amount: ${amount}
  
  Max 100 characters. Return ONLY the description.`;
  
  try {
    const ai = getAI();
    const response = await ai.models.generateContent({
      model: "gemini-3.1-flash-lite-preview",
      contents: prompt
    });
    return response.text?.trim() || `Payment to ${contactName} (Inv: ${invoiceNumber})`;
  } catch (error) {
    console.error('Gemini Error:', error);
    return `Payment to ${contactName} (Inv: ${invoiceNumber})`;
  }
};

export const analyseProjectExpenditure = async (projectData: any[]) => {
  const prompt = `Analyse the following project expenditure data and provide 3-4 concise, actionable insights or observations.
  Data: ${JSON.stringify(projectData)}`;

  try {
    const ai = getAI();
    const response = await ai.models.generateContent({
      model: "gemini-3.1-pro-preview",
      contents: prompt,
      config: {
        systemInstruction: `You are a financial analyst expert specializing in the South African market. 
        Focus on:
        - Budget utilization (over/under budget)
        - Potential risks
        - Efficiency
        
        IMPORTANT: All monetary values are in South African Rands (ZAR). Use "R" as the currency symbol.
        Use South African English spellings (e.g., organisation, programme, centre, analyse).
        Return the insights as a bulleted list. Keep it professional and concise.`,
        thinkingConfig: { thinkingLevel: ThinkingLevel.HIGH }
      }
    });
    return response.text || "No insights available at this time.";
  } catch (error) {
    console.error('Gemini Error:', error);
    return "Failed to generate AI insights.";
  }
};

export const analyseProjectBudget = async (project: any) => {
  const prompt = `Analyse the budget and phases for the following project:
  Project: ${project.name}
  Total Budget: ${project.totalBudget}
  Phases: ${JSON.stringify(project.phases)}
  
  Provide a professional assessment of:
  - Budget distribution across phases.
  - Potential bottlenecks or underfunded areas.
  - Suggestions for better resource allocation.
  
  Return the analysis as a bulleted list.`;

  try {
    const ai = getAI();
    const response = await ai.models.generateContent({
      model: "gemini-3.1-pro-preview",
      contents: prompt,
      config: {
        systemInstruction: "You are a senior project manager and financial advisor in South Africa. All currency is in ZAR (R). Use South African English spellings (e.g., organisation, centre, analyse).",
        thinkingConfig: { thinkingLevel: ThinkingLevel.HIGH }
      }
    });
    return response.text || "No budget analysis available.";
  } catch (error) {
    console.error('Gemini Error:', error);
    return "Failed to analyse project budget.";
  }
};

export const analysePayrollCosts = async (payrollData: any) => {
  const prompt = `Analyse the following payroll data for the current month:
  Total Gross: ${payrollData.totalGross}
  Total Net: ${payrollData.totalNet}
  Total PAYE: ${payrollData.totalPaye}
  Total UIF: ${payrollData.totalUif}
  Number of Employees: ${payrollData.records.length}
  
  Provide a professional assessment of:
  - Statutory compliance costs (PAYE, UIF, SDL).
  - Comparison of Gross vs Net pay.
  - Potential areas for cost optimization or risks.
  
  Return the analysis as a bulleted list.`;

  try {
    const ai = getAI();
    const response = await ai.models.generateContent({
      model: "gemini-3.1-pro-preview",
      contents: prompt,
      config: {
        systemInstruction: "You are a senior payroll specialist and financial advisor in South Africa. Focus on SARS compliance (PAYE, UIF, SDL). All currency is in ZAR (R). Use South African English spellings (e.g., organisation, centre, analyse).",
        thinkingConfig: { thinkingLevel: ThinkingLevel.HIGH }
      }
    });
    return response.text || "No payroll analysis available.";
  } catch (error) {
    console.error('Gemini Error:', error);
    return "Failed to analyse payroll costs.";
  }
};
