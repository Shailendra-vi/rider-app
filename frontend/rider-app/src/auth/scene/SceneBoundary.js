import { Component } from 'react';
import AuthSceneFallback from './AuthSceneFallback';

export default class SceneBoundary extends Component {
  state = { failed: false };
  static getDerivedStateFromError() {
    return { failed: true };
  }
  render() {
    return this.state.failed ? <AuthSceneFallback /> : this.props.children;
  }
}
