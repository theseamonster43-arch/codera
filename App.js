import React, { useEffect, useMemo, useState } from 'react';
import { View, ActivityIndicator } from 'react-native';
import { NavigationContainer, DefaultTheme, DarkTheme } from '@react-navigation/native';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { onAuthStateChanged } from 'firebase/auth';

import { auth } from './src/firebase';
import { useTheme } from './src/theme';
import TabBar from './src/TabBar';
import SignInScreen from './src/screens/SignInScreen';
import HomeScreen from './src/screens/HomeScreen';
import ShortsScreen from './src/screens/ShortsScreen';
import FollowedScreen from './src/screens/FollowedScreen';
import YouScreen from './src/screens/YouScreen';
import ComposePostScreen from './src/screens/ComposePostScreen';
import ComposeVideoScreen from './src/screens/ComposeVideoScreen';

const Tab = createBottomTabNavigator();
const Stack = createNativeStackNavigator();

function Tabs() {
  const T = useTheme();
  return (
    <Tab.Navigator
      // Drawn by hand: no labels, and the + in the middle is an action rather
      // than a tab. Being a plain view pinned to the bottom also means iPadOS
      // cannot relocate it to the top the way it does a real UITabBar.
      tabBar={props => <TabBar {...props} />}
      screenOptions={{
        headerShown: false,
        sceneStyle: { backgroundColor: T.bg },
        // Slides in from the side the tab sits on, so the direction tells you
        // where you went. Built into the navigator, so it runs natively.
        animation: 'shift',
      }}
    >
      <Tab.Screen name="Home" component={HomeScreen} />
      <Tab.Screen name="Shorts" component={ShortsScreen} />
      <Tab.Screen name="Followed" component={FollowedScreen} />
      <Tab.Screen name="You" component={YouScreen} />
    </Tab.Navigator>
  );
}

export default function App() {
  const T = useTheme();

  // `ready` separates "nobody is signed in" from "Firebase has not answered
  // yet". Without it the sign-in screen flashes on every launch for someone who
  // is already signed in, while the saved session is still being read back.
  const [user, setUser] = useState(null);
  const [ready, setReady] = useState(false);

  useEffect(() => onAuthStateChanged(auth, u => {
    setUser(u);
    setReady(true);
  }), []);

  const navTheme = useMemo(() => {
    const base = T.dark ? DarkTheme : DefaultTheme;
    return {
      ...base,
      colors: {
        ...base.colors,
        background: T.bg, card: T.bg, border: T.border, text: T.text, primary: T.blue,
      },
    };
  }, [T]);

  if (!ready) {
    return (
      <View style={{ flex: 1, backgroundColor: T.bg, justifyContent: 'center' }}>
        <ActivityIndicator color={T.blue} />
      </View>
    );
  }

  return (
    <SafeAreaProvider>
      {!user ? (
        // Signed out there is no navigator at all, rather than a navigator with
        // guarded screens — so no deep link or back gesture can reach inside.
        <SignInScreen />
      ) : (
        <NavigationContainer theme={navTheme}>
          <Stack.Navigator screenOptions={{ headerShown: false }}>
            <Stack.Screen name="Tabs" component={Tabs} />
            {/* Composing slides up over everything, tab bar included: it is a
                task you finish or cancel, not a place you navigate around. */}
            <Stack.Group screenOptions={{ presentation: 'modal', animation: 'slide_from_bottom' }}>
              <Stack.Screen name="ComposePost" component={ComposePostScreen} />
              <Stack.Screen name="ComposeVideo" component={ComposeVideoScreen} />
            </Stack.Group>
          </Stack.Navigator>
        </NavigationContainer>
      )}
    </SafeAreaProvider>
  );
}
