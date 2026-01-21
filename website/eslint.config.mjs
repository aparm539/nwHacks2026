import antfu from '@antfu/eslint-config'
import nextPlugin from '@next/eslint-plugin-next'

export default antfu(
  {
    react: true,
    typescript: true,

    lessOpinionated: true,

    stylistic: {
      semi: true,
    },

    formatters: {
      css: true,
    },
    ignores: [ 'next-env.d.ts'],
  },
  {
    plugins: {
      '@next/next': nextPlugin,
    },
    rules: {
      ...nextPlugin.configs.recommended.rules,
      ...nextPlugin.configs['core-web-vitals'].rules,
    },
  },
  {
    rules:
    {
      'node/prefer-global/process': 'off', // Allow using `process.env`
    },
  },
)
