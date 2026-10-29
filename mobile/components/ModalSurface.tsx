import React from 'react';
import {KeyboardAvoidingView,Platform,StyleSheet,type StyleProp,type ViewStyle} from 'react-native';
import {SafeAreaProvider,SafeAreaView} from 'react-native-safe-area-context';

type Props={children:React.ReactNode;style?:StyleProp<ViewStyle>;keyboard?:boolean;onEscape?:()=>void};

// A native Modal has its own window. Its provider measures that window rather
// than adding the parent screen's padding; SafeAreaView applies its insets once.
export function ModalSurface({children,style,keyboard=false,onEscape}:Props){
  return <SafeAreaProvider style={styles.fill}>
    <SafeAreaView edges={['top','right','bottom','left']} style={[styles.fill,style]} accessibilityViewIsModal onAccessibilityEscape={onEscape}>
      {keyboard?<KeyboardAvoidingView style={styles.fill} enabled={Platform.OS==='ios'} behavior="padding">{children}</KeyboardAvoidingView>:children}
    </SafeAreaView>
  </SafeAreaProvider>;
}
const styles=StyleSheet.create({fill:{flex:1,backgroundColor:'#090F15'}});
