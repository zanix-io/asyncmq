export const douplicatesErrorInfo = (jobName: string) => ({
  code: 'JOB_DUPLICATE_REGISTRATION',
  meta: {
    source: 'zanix',
    jobName,
    errorDetails: {
      reason: 'DUPLICATE_JOB_NAME',
      message:
        'Each job must have a unique name. A job with this name was already registered earlier in the application lifecycle.',
      suggestion: 'Rename the job or remove the duplicate registration to resolve this conflict.',
    },
  },
})
