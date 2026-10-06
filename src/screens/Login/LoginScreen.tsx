import { useState } from 'react';
import { View, Text, TextInput, TouchableOpacity, StyleSheet, Alert } from 'react-native';
import { supabase } from '../../services/supabase';

export default function LoginScreen() {
  const [isLogin, setIsLogin] = useState(true);
  const [emailOrUsername, setEmailOrUsername] = useState('');
  const [email, setEmail] = useState('');
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [role, setRole] = useState('user'); 

  const handleAuth = async () => {
    if (isLogin) {
      let loginEmail = emailOrUsername.trim();
      
      if (!loginEmail.includes('@')) {
        const { data, error } = await supabase.from('profiles').select('email').eq('username', loginEmail).single();
        if (error || !data) return Alert.alert('Error', 'User not found');
        loginEmail = data.email;
      }

      const { error } = await supabase.auth.signInWithPassword({ email: loginEmail, password });
      if (error) Alert.alert('Error', error.message);
    } else {
      if (!username) return Alert.alert('Error', 'Username is required');
      const { error } = await supabase.auth.signUp({
        email: email.trim(),
        password,
        options: { data: { username: username.trim(), role } }
      });
      if (error) Alert.alert('Error', error.message);
      else {
        Alert.alert('Success', 'Account created!');
      }
    }
  };

  return (
    <View style={styles.container}>
      <Text style={styles.title}>{isLogin ? 'Welcome Back' : 'Create Account'}</Text>
      
      {isLogin ? (
        <TextInput 
          style={styles.input} 
          placeholder="Email or Username" 
          autoCapitalize="none" 
          onChangeText={setEmailOrUsername} 
        />
      ) : (
        <>
          <TextInput 
            style={styles.input} 
            placeholder="Username" 
            autoCapitalize="none" 
            onChangeText={setUsername} 
          />
          <TextInput 
            style={styles.input} 
            placeholder="Email" 
            keyboardType="email-address"
            autoCapitalize="none" 
            onChangeText={setEmail} 
          />
        </>
      )}
      
      <TextInput 
        style={styles.input} 
        placeholder="Password" 
        secureTextEntry 
        onChangeText={setPassword} 
      />
      
      {!isLogin && (
        <View style={styles.roleContainer}>
          <TouchableOpacity 
            style={[styles.roleBtn, role === 'user' && styles.activeRole]} 
            onPress={() => setRole('user')}
          >
            <Text style={role === 'user' ? styles.activeText : styles.inactiveText}>Regular User</Text>
          </TouchableOpacity>
          <TouchableOpacity 
            style={[styles.roleBtn, role === 'creator' && styles.activeRole]} 
            onPress={() => setRole('creator')}
          >
            <Text style={role === 'creator' ? styles.activeText : styles.inactiveText}>Creator</Text>
          </TouchableOpacity>
        </View>
      )}

      <TouchableOpacity style={styles.button} onPress={handleAuth}>
        <Text style={styles.buttonText}>{isLogin ? 'Log In' : 'Sign Up'}</Text>
      </TouchableOpacity>

      <TouchableOpacity style={styles.toggleBtn} onPress={() => setIsLogin(!isLogin)}>
        <Text style={styles.toggleText}>
          {isLogin ? "Don't have an account? Sign up" : "Already have an account? Log in"}
        </Text>
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, justifyContent: 'center', padding: 25, backgroundColor: '#fff' },
  title: { fontSize: 32, fontWeight: 'bold', marginBottom: 30, textAlign: 'center' },
  input: { borderWidth: 1, borderColor: '#ddd', padding: 15, borderRadius: 10, marginBottom: 15, backgroundColor: '#f9f9f9' },
  roleContainer: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 20 },
  roleBtn: { flex: 1, padding: 15, borderWidth: 1, borderColor: '#ddd', alignItems: 'center', borderRadius: 10, marginHorizontal: 5 },
  activeRole: { backgroundColor: '#000', borderColor: '#000' },
  activeText: { color: '#fff', fontWeight: 'bold' },
  inactiveText: { color: '#666' },
  button: { backgroundColor: '#000', padding: 18, borderRadius: 10, alignItems: 'center' },
  buttonText: { color: '#fff', fontSize: 18, fontWeight: 'bold' },
  toggleBtn: { marginTop: 20, alignItems: 'center' },
  toggleText: { color: '#666', fontSize: 16 }
});