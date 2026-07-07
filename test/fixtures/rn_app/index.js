import { AppRegistry } from 'react-native';
import analytics from '@react-native-firebase/analytics';
import AsyncStorage from '@react-native-async-storage/async-storage';
const RNFS = require('react-native-fs');

// Fixture app source: axios and react-native-appsflyer are declared in
// package.json but never imported.
AppRegistry.registerComponent('rn-demo', () => null);
