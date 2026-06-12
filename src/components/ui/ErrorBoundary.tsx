import { Component, type ReactNode } from 'react'

interface Props { children: ReactNode }
interface State { hasError: boolean }

export class ErrorBoundary extends Component<Props, State> {
  state: State = { hasError: false }

  static getDerivedStateFromError(): State {
    return { hasError: true }
  }

  componentDidCatch(error: Error) {
    // Ignorar el error de removeChild causado por extensiones del navegador
    if (error.message.includes('removeChild') || error.message.includes('not a child')) return
    console.error('[EduSafe ErrorBoundary]', error)
  }

  render() {
    if (this.state.hasError) {
      // Re-intentar render limpio en el siguiente tick
      setTimeout(() => this.setState({ hasError: false }), 0)
      return null
    }
    return this.props.children
  }
}
