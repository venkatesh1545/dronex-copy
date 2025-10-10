import React, { useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/components/ui/use-toast';
import { Mail, Phone, Check, Clock, X, Send, CheckCircle, AlertCircle } from 'lucide-react';

interface EmergencyContact {
  id: string;
  name: string;
  phone: string;
  email?: string;
  relationship?: string;
  priority: number;
  verification_status: 'not_started' | 'pending' | 'verified' | 'failed';
  verification_type?: 'email' | 'sms';
  verification_code?: string;
  verification_expires_at?: string;
  verified_at?: string;
  created_at?: string;
  updated_at?: string;
}

interface EmergencyContactVerificationProps {
  contacts: EmergencyContact[];
  onVerificationUpdate: () => void;
}

const sendVerificationEmail = async (
  email: string,
  name: string,
  code: string,
  requesterName: string,
  requesterEmail: string
) => {
  try {
    const { data, error } = await supabase.functions.invoke('send-verification-email', {
      body: {
        to: email,
        name: name,
        verificationCode: code,
        requesterName: requesterName,
        requesterEmail: requesterEmail
      }
    });

    if (error) {
      console.error('Edge function error:', error);
      throw new Error(`Failed to send email: ${error.message}`);
    }

    return {
      success: data?.success || false,
      message: data?.message || 'Email processed',
      emailId: data?.emailId,
      emailSent: !!data?.emailSent,
      devFallback: !!data?.devFallback,
      accountExists: !!data?.accountExists,
      verificationCode: data?.verificationCode,
    };
  } catch (error: any) {
    console.error('Email send error:', error);
    throw error;
  }
};

export const EmergencyContactVerification: React.FC<EmergencyContactVerificationProps> = ({
  contacts,
  onVerificationUpdate
}) => {
  const [verifyingContact, setVerifyingContact] = useState<string | null>(null);
  const [verificationCodes, setVerificationCodes] = useState<{[key: string]: string}>({});
  const [verificationType, setVerificationType] = useState<'email' | 'sms'>('email');
  const { toast } = useToast();

  const sendVerification = async (contactId: string, type: 'email' | 'sms') => {
    setVerifyingContact(contactId);
    
    try {
      const contact = contacts.find(c => c.id === contactId);
      if (!contact) {
        toast({
          title: "❌ Error",
          description: "Contact not found",
          variant: "destructive",
        });
        return;
      }

      // Generate 6-digit verification code
      const code = Math.floor(100000 + Math.random() * 900000).toString();
      const expiresAt = new Date(Date.now() + 30 * 60 * 1000).toISOString(); // 30 minutes

      // Get current user
      const { data: { user }, error: authError } = await supabase.auth.getUser();
      if (authError || !user) {
        toast({
          title: "❌ Authentication Error",
          description: "You must be logged in to send verification codes.",
          variant: "destructive",
        });
        return;
      }

      // Update contact with verification code
      const { error: updateError } = await supabase
        .from('emergency_contacts')
        .update({
          verification_code: code,
          verification_type: type,
          verification_expires_at: expiresAt,
          verification_status: 'pending'
        })
        .eq('id', contactId)
        .eq('user_id', user.id);

      if (updateError) {
        console.error('Database update error:', updateError);
        toast({
          title: "❌ Database Error",
          description: `Failed to update contact: ${updateError.message}`,
          variant: "destructive",
        });
        return;
      }

      if (type === 'email' && contact.email) {
        try {
          const requesterName = user.user_metadata?.name || 
                               user.user_metadata?.display_name || 
                               user.user_metadata?.full_name || 
                               user.email?.split('@')[0] || 'User';
          const requesterEmail = user.email || '';

          const result = await sendVerificationEmail(
            contact.email,
            contact.name,
            code,
            requesterName,
            requesterEmail
          );

          if (result.emailSent) {
            toast({
              title: "✅ Verification Email Sent!",
              description: (
                <div className="space-y-1">
                  <p>Verification code sent to <strong>{contact.email}</strong></p>
                  {result.emailId && (
                    <p className="text-xs opacity-75">Email ID: {result.emailId}</p>
                  )}
                </div>
              ),
              duration: 8000,
            });
          } else if (result.devFallback) {
            setVerificationCodes(prev => ({ ...prev, [contactId]: code }));
            toast({
              title: "🔧 Test Mode: OTP Shown",
              description: (
                <div className="space-y-1">
                  <p>Email not sent due to provider restrictions (domain not verified).</p>
                  <p>Use this OTP: <strong className="font-mono">{code}</strong></p>
                </div>
              ),
              duration: 12000,
            });
          } else {
            toast({
              title: "Email Not Sent",
              description: `Could not send email to ${contact.email}. Please try again later.`,
              variant: "destructive",
              duration: 8000,
            });
          }
        } catch (emailError: any) {
          console.error('Email service error:', emailError);
          toast({
            title: "⚠️ Email Service Error",
            description: `Failed to send email: ${emailError.message || 'Please try again'}`,
            variant: "destructive",
            duration: 10000,
          });
        }
      } else if (type === 'sms') {
        toast({
          title: "📱 SMS Feature Coming Soon",
          description: "SMS verification will be available soon. For now, use email verification.",
          duration: 8000,
        });
        
        // Reset status since SMS is not available
        await supabase
          .from('emergency_contacts')
          .update({
            verification_status: 'failed',
            verification_code: null,
            verification_expires_at: null
          })
          .eq('id', contactId)
          .eq('user_id', user.id);
      }

      onVerificationUpdate();
    } catch (error: any) {
      console.error('Send verification error:', error);
      toast({
        title: "❌ Verification Failed",
        description: `Failed to send verification code: ${error.message || 'Please try again'}`,
        variant: "destructive",
      });
    } finally {
      setVerifyingContact(null);
    }
  };

  const verifyCode = async (contactId: string, inputCode: string) => {
    try {
      // Get current user
      const { data: { user }, error: authError } = await supabase.auth.getUser();
      if (authError || !user) {
        toast({
          title: "❌ Authentication Error",
          description: "You must be logged in to verify contacts.",
          variant: "destructive",
        });
        return;
      }

      // Fetch the contact from database
      const { data: contactData, error: fetchError } = await supabase
        .from('emergency_contacts')
        .select('*')
        .eq('id', contactId)
        .eq('user_id', user.id)
        .single();

      if (fetchError) {
        console.error('Fetch Error:', fetchError);
        toast({
          title: "❌ Verification Error",
          description: `Database error: ${fetchError.message}`,
          variant: "destructive",
        });
        return;
      }

      if (!contactData) {
        toast({
          title: "❌ Contact Not Found",
          description: "Could not find this contact. Please refresh and try again.",
          variant: "destructive",
        });
        return;
      }

      // Validate verification code
      const storedCode = String(contactData.verification_code || '').trim();
      const enteredCode = String(inputCode || '').trim();

      if (storedCode.length !== 6 || enteredCode.length !== 6) {
        toast({
          title: "❌ Invalid Code",
          description: "The verification code must be exactly 6 digits.",
          variant: "destructive",
        });
        return;
      }

      if (storedCode !== enteredCode) {
        toast({
          title: "❌ Incorrect Code",
          description: "The verification code you entered doesn't match. Please check and try again.",
          variant: "destructive",
        });
        return;
      }

      // Check expiration
      if (contactData.verification_expires_at) {
        const expirationTime = new Date(contactData.verification_expires_at);
        const currentTime = new Date();
        if (expirationTime < currentTime) {
          toast({
            title: "⏰ Code Expired",
            description: "The verification code has expired. Please request a new one.",
            variant: "destructive",
          });
          return;
        }
      }

      // Update verification status
      const { data: updateData, error: updateError } = await supabase
        .from('emergency_contacts')
        .update({
          verification_status: 'verified',
          verified_at: new Date().toISOString(),
          verification_code: null,
          verification_expires_at: null
        })
        .eq('id', contactId)
        .eq('user_id', user.id)
        .select();

      if (updateError) {
        console.error('Update Error:', updateError);
        toast({
          title: "❌ Database Update Failed",
          description: `Error: ${updateError.message}. Please check your permissions and try again.`,
          variant: "destructive",
        });
        return;
      }

      if (!updateData || updateData.length === 0) {
        toast({
          title: "❌ Update Failed",
          description: "No rows were updated. Please check your database permissions.",
          variant: "destructive",
        });
        return;
      }

      toast({
        title: "🎉 Contact Verified Successfully!",
        description: (
          <div className="space-y-1">
            <p><strong>{contactData.name}</strong> has been verified</p>
            <p className="text-xs opacity-75">Emergency network activated</p>
          </div>
        ),
      });

      setVerificationCodes(prev => ({ ...prev, [contactId]: '' }));
      onVerificationUpdate();

    } catch (error: any) {
      console.error('Verification Error:', error);
      toast({
        title: "❌ Verification Error",
        description: `Unexpected error: ${error?.message || 'Please try again'}`,
        variant: "destructive",
      });
    }
  };

  const getStatusBadge = (contact: EmergencyContact) => {
    switch (contact.verification_status) {
      case 'verified':
        return (
          <Badge variant="default" className="bg-green-100 text-green-800 whitespace-nowrap">
            <CheckCircle className="w-3 h-3 mr-1" />
            Verified
          </Badge>
        );
      case 'pending':
        return (
          <Badge variant="secondary" className="bg-blue-100 text-blue-800 whitespace-nowrap">
            <Clock className="w-3 h-3 mr-1" />
            Pending
          </Badge>
        );
      case 'failed':
        return (
          <Badge variant="destructive" className="whitespace-nowrap">
            <AlertCircle className="w-3 h-3 mr-1" />
            Failed
          </Badge>
        );
      default:
        return (
          <Badge variant="outline" className="whitespace-nowrap">
            <Clock className="w-3 h-3 mr-1" />
            Not Started
          </Badge>
        );
    }
  };

  const getPriorityBadge = (priority: number) => {
    const priorityConfig = {
      1: { label: 'Priority 1', className: 'border-red-500 text-red-700 bg-red-50' },
      2: { label: 'Priority 2', className: 'border-orange-500 text-orange-700 bg-orange-50' },
      3: { label: 'Priority 3', className: 'border-yellow-500 text-yellow-700 bg-yellow-50' },
      4: { label: 'Priority 4', className: 'border-blue-500 text-blue-700 bg-blue-50' },
      5: { label: 'Priority 5', className: 'border-gray-500 text-gray-700 bg-gray-50' }
    };
    
    const config = priorityConfig[priority as keyof typeof priorityConfig] || priorityConfig[5];
    
    return (
      <Badge variant="outline" className={`text-xs ${config.className}`}>
        {config.label}
      </Badge>
    );
  };

  const handleCodeChange = (contactId: string, code: string) => {
    setVerificationCodes(prev => ({ ...prev, [contactId]: code }));
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center">
          <Mail className="h-5 w-5 mr-2 text-primary" />
          Contact Verification
        </CardTitle>
        <CardDescription>
          Verify your emergency contacts to enable group chat and location sharing.
          Verification emails are sent instantly via our secure email service.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <div className="space-y-4">
          {contacts.map((contact) => (
            <div key={contact.id} className="flex items-start justify-between p-4 border rounded-lg bg-card hover:bg-accent/5 transition-colors">
              <div className="flex-1 min-w-0 mr-4">
                <div className="flex items-center gap-2 mb-2 flex-wrap">
                  <h4 className="font-medium truncate">{contact.name}</h4>
                  {getPriorityBadge(contact.priority)}
                  {getStatusBadge(contact)}
                </div>
                <div className="text-sm text-muted-foreground space-y-1">
                  <div className="flex items-center gap-2">
                    <Phone className="w-4 h-4 flex-shrink-0" />
                    <span className="truncate">{contact.phone}</span>
                  </div>
                  {contact.email && (
                    <div className="flex items-center gap-2">
                      <Mail className="w-4 h-4 flex-shrink-0" />
                      <span className="truncate">{contact.email}</span>
                    </div>
                  )}
                  {contact.relationship && (
                    <div className="text-xs text-muted-foreground">
                      Relationship: {contact.relationship}
                    </div>
                  )}
                  {contact.verified_at && (
                    <div className="text-xs text-green-600 font-medium">
                      ✓ Verified on {new Date(contact.verified_at).toLocaleDateString()}
                    </div>
                  )}
                  {contact.verification_expires_at && contact.verification_status === 'pending' && (
                    <div className="text-xs text-blue-600">
                      Code expires: {new Date(contact.verification_expires_at).toLocaleTimeString()}
                    </div>
                  )}
                </div>
              </div>

              <div className="flex items-center gap-2 flex-shrink-0">
                {contact.verification_status === 'verified' ? (
                  <div className="flex items-center gap-2 text-green-600 text-sm font-medium whitespace-nowrap">
                    <CheckCircle className="w-4 h-4" />
                    Verified
                  </div>
                ) : contact.verification_status === 'pending' && contact.verification_code ? (
                  <div className="flex items-center gap-2">
                    <Input
                      placeholder="Enter 6-digit code"
                      value={verificationCodes[contact.id] || ''}
                      onChange={(e) => handleCodeChange(contact.id, e.target.value)}
                      className="w-32 h-9 text-center font-mono"
                      maxLength={6}
                    />
                    <Button
                      size="sm"
                      onClick={() => verifyCode(contact.id, verificationCodes[contact.id] || '')}
                      disabled={(verificationCodes[contact.id] || '').length !== 6}
                      className="h-9 whitespace-nowrap"
                    >
                      <CheckCircle className="w-4 h-4 mr-1" />
                      Verify
                    </Button>
                  </div>
                ) : (
                  <div className="flex items-center gap-2">
                    <Select
                      value={verificationType}
                      onValueChange={(value: 'email' | 'sms') => setVerificationType(value)}
                    >
                      <SelectTrigger className="w-24 h-9">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {contact.email && (
                          <SelectItem value="email">Email</SelectItem>
                        )}
                        <SelectItem value="sms" disabled>SMS (Soon)</SelectItem>
                      </SelectContent>
                    </Select>
                    <Button
                      size="sm"
                      onClick={() => sendVerification(contact.id, verificationType)}
                      disabled={
                        verifyingContact === contact.id ||
                        (!contact.email && verificationType === 'email')
                      }
                      className="h-9 whitespace-nowrap"
                    >
                      {verifyingContact === contact.id ? (
                        <>
                          <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white mr-1" />
                          Sending...
                        </>
                      ) : (
                        <>
                          <Send className="w-4 h-4 mr-1" />
                          Send Code
                        </>
                      )}
                    </Button>
                  </div>
                )}
              </div>
            </div>
          ))}

          {contacts.length === 0 && (
            <div className="text-center py-12 text-muted-foreground">
              <Mail className="w-16 h-16 mx-auto mb-4 opacity-30" />
              <h3 className="text-lg font-medium mb-2">No Emergency Contacts</h3>
              <p className="text-sm">Add emergency contacts first to enable verification</p>
            </div>
          )}
        </div>

        {contacts.length > 0 && (
          <div className="mt-6 p-4 bg-blue-50 border border-blue-200 rounded-lg">
            <h4 className="font-medium text-blue-900 mb-2">📧 How Verification Works:</h4>
            <ul className="text-sm text-blue-800 space-y-1">
              <li>• Click "Send Code" to send a verification email</li>
              <li>• Check your email inbox for the 6-digit verification code</li>
              <li>• Enter the code and click "Verify" to activate the contact</li>
              <li>• Verified contacts can receive emergency notifications</li>
            </ul>
            <div className="mt-4 pt-4 border-t border-blue-200">
              <h5 className="font-medium text-blue-900 mb-2">🔢 Priority Levels:</h5>
              <div className="text-sm text-blue-800 space-y-1">
                <div className="flex items-center gap-2">
                  <Badge variant="outline" className="border-red-500 text-red-700 bg-red-50 text-xs">Priority 1</Badge>
                  <span>Immediate family (spouse, parents)</span>
                </div>
                <div className="flex items-center gap-2">
                  <Badge variant="outline" className="border-orange-500 text-orange-700 bg-orange-50 text-xs">Priority 2</Badge>
                  <span>Close relatives (siblings, children)</span>
                </div>
                <div className="flex items-center gap-2">
                  <Badge variant="outline" className="border-yellow-500 text-yellow-700 bg-yellow-50 text-xs">Priority 3</Badge>
                  <span>Close friends</span>
                </div>
                <div className="flex items-center gap-2">
                  <Badge variant="outline" className="border-blue-500 text-blue-700 bg-blue-50 text-xs">Priority 4</Badge>
                  <span>Colleagues, acquaintances</span>
                </div>
                <div className="flex items-center gap-2">
                  <Badge variant="outline" className="border-gray-500 text-gray-700 bg-gray-50 text-xs">Priority 5</Badge>
                  <span>Neighbors, backup contacts</span>
                </div>
              </div>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
};

export default EmergencyContactVerification;
